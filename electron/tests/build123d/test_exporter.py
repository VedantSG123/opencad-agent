import importlib.util
import json
import os
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
import zipfile


RUNNER_DIRECTORY = Path(__file__).resolve().parents[2] / 'python'
sys.path.insert(0, str(RUNNER_DIRECTORY))
from exporter import _single_shape

HAS_BUILD123D = importlib.util.find_spec('build123d') is not None


def shown(obj, name=None, color=None, alpha=None):
    return {'object': obj, 'name': name, 'color': color, 'alpha': alpha}


def leaves(shape, parent=None):
    from build123d import Location
    location = (parent or Location()) * shape.location
    if shape.children:
        for child in shape.children:
            yield from leaves(child, location)
    else:
        yield shape, location


@unittest.skipUnless(HAS_BUILD123D, 'needs the build123d environment')
class ExporterTests(unittest.TestCase):
    def test_empty_shown_model_reports_no_exportable_shapes(self):
        with self.assertRaisesRegex(ValueError, 'The script showed no exportable shapes'):
            _single_shape([shown(None)])

    def test_preserves_shape_color_when_show_has_no_appearance_override(self):
        from build123d import Box, Color
        original = Box(1, 1, 1)
        original.color = Color('#4080ff80')
        exported = _single_shape([shown(original)])
        leaf, _ = next(leaves(exported))
        for actual, expected in zip(tuple(leaf.color), (64 / 255, 128 / 255, 1, 128 / 255)):
            self.assertAlmostEqual(actual, expected)

    def test_show_overrides_existing_name_color_and_alpha_without_mutation(self):
        from build123d import Box, Color
        original = Box(1, 2, 3)
        original.label = 'saved label'
        original.color = Color('blue')
        exported = _single_shape([shown(original, 'shown label', 'red', 0.25)])
        leaf, _ = next(leaves(exported))
        self.assertEqual(leaf.label, 'shown label')
        self.assertEqual(tuple(leaf.color), (1, 0, 0, 0.25))
        self.assertEqual(original.label, 'saved label')
        self.assertEqual(tuple(original.color), (0, 0, 1, 1))

    def test_repeated_shape_has_independent_appearance(self):
        from build123d import Box
        original = Box(1, 1, 1)
        exported = _single_shape([
            shown(original, 'first', (255, 0, 0), 0.2),
            shown(original, 'second', '#0000ff', 0.8),
        ])
        parts = [part for part, _ in leaves(exported)]
        self.assertEqual([part.label for part in parts], ['first', 'second'])
        self.assertEqual([tuple(part.color) for part in parts], [(1, 0, 0, 0.2), (0, 0, 1, 0.8)])
        self.assertEqual(original.label, '')
        self.assertIsNone(original.color)

    def test_normalizes_byte_rgb_and_embedded_transparency_like_preview(self):
        from build123d import Box
        exported = _single_shape([shown(Box(1, 1, 1), color=(128, 64, 0, 128))])
        leaf, _ = next(leaves(exported))
        for actual, expected in zip(tuple(leaf.color), (128 / 255, 64 / 255, 0, 128 / 255)):
            self.assertAlmostEqual(actual, expected)

    def test_builder_and_list_entries_export_their_shapes(self):
        from build123d import Box, BuildPart, Pos
        with BuildPart() as builder:
            Box(1, 2, 3)
        exported = _single_shape([shown(builder, 'built'), shown([Pos(4, 0, 0) * Box(1, 1, 1)], 'listed')])
        self.assertAlmostEqual(sum(part.volume for part, _ in leaves(exported)), 7)
        self.assertEqual(exported.children[0].label, 'built')

    def test_nested_assembly_preserves_placement_and_child_appearance(self):
        from build123d import Box, Color, Compound, Pos
        child = Box(1, 1, 1)
        child.label = 'child'
        child.color = Color('blue')
        inner = Compound(children=[child], label='inner')
        inner.location = Pos(2, 0, 0)
        original = Compound(children=[inner], label='outer')
        original.location = Pos(10, 0, 0)
        exported = _single_shape([shown(original, 'shown assembly', alpha=0.5)])
        leaf, location = next(leaves(exported))
        world = leaf.moved(location * leaf.location.inverse())
        self.assertAlmostEqual(world.bounding_box().min.X, 11.5)
        self.assertAlmostEqual(world.bounding_box().max.X, 12.5)
        self.assertEqual(tuple(leaf.color), (0, 0, 1, 0.5))
        self.assertEqual(original.label, 'outer')
        self.assertEqual(child.label, 'child')
        self.assertEqual(tuple(child.color), (0, 0, 1, 1))

    def test_supported_formats_through_stdin_exporter(self):
        from build123d import import_step
        script = '''from build123d import *
left = Pos(2, 0, 0) * Box(1, 2, 3)
left.label = 'old label'
left.color = Color('blue')
right = Pos(-2, 0, 0) * Box(1, 2, 3)
right.color = Color('green')
assembly = Compound(children=[left, right], label='assembly')
assembly.location = Pos(10, 0, 0)
show(assembly, names=['shown assembly'], colors=['red'], alphas=[0.25])
'''
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            main = root / 'main.py'
            main.write_text(script)
            for fmt, extension in [('step', 'step'), ('stl', 'stl'), ('stl-ascii', 'stl'), ('3mf', '3mf'), ('glb', 'glb')]:
                with self.subTest(format=fmt):
                    output = root / f'model-{fmt}.{extension}'
                    response = subprocess.run(
                        [sys.executable, str(RUNNER_DIRECTORY / 'exporter.py')],
                        input=json.dumps({'script': str(main), 'cwd': directory, 'sysPath': [directory], 'overridesPath': None, 'format': fmt, 'output': str(output)}),
                        capture_output=True, text=True, timeout=30,
                        env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'},
                    )
                    self.assertEqual(response.returncode, 0, response.stderr)
                    result = json.loads(response.stdout)
                    self.assertTrue(result['ok'], result.get('error'))
                    data = output.read_bytes()
                    self.assertEqual(result['bytes'], len(data))
                    if fmt == 'step':
                        imported = import_step(output)
                        self.assertTrue('shown assembly' in data.decode(), 'STEP must retain the shown assembly name')
                        self.assertAlmostEqual(imported.bounding_box().min.X, 7.5)
                        self.assertAlmostEqual(imported.bounding_box().max.X, 12.5)
                        self.assertTrue("DRAUGHTING_PRE_DEFINED_COLOUR('red')" in data.decode(), 'STEP must retain the shown color')
                        self.assertTrue('SURFACE_STYLE_TRANSPARENT(0.75)' in data.decode(), 'STEP must retain the shown alpha')
                    elif fmt == 'stl':
                        count = struct.unpack_from('<I', data, 80)[0]
                        self.assertEqual(count, 24)
                        self.assertEqual(len(data), 84 + count * 50)
                        xs = [
                            struct.unpack_from('<f', data, 84 + triangle * 50 + 12 + vertex * 12)[0]
                            for triangle in range(count) for vertex in range(3)
                        ]
                        self.assertAlmostEqual(min(xs), 7.5)
                        self.assertAlmostEqual(max(xs), 12.5)
                    elif fmt == 'stl-ascii':
                        text = data.decode()
                        self.assertTrue(text.startswith('solid '))
                        self.assertEqual(text.count('facet normal'), 24)
                        xs = [float(line.split()[1]) for line in text.splitlines() if line.strip().startswith('vertex ')]
                        self.assertAlmostEqual(min(xs), 7.5)
                        self.assertAlmostEqual(max(xs), 12.5)
                    elif fmt == '3mf':
                        with zipfile.ZipFile(output) as archive:
                            document = ET.fromstring(archive.read('3D/3dmodel.model'))
                        ns = {'m': 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02'}
                        colors = [node.attrib['displaycolor'] for node in document.findall('.//m:base', ns)]
                        self.assertEqual(colors, ['#FF000040', '#FF000040'])
                        vertices = document.findall('.//m:vertex', ns)
                        xs = [float(vertex.attrib['x']) for vertex in vertices]
                        self.assertAlmostEqual(min(xs), 7.5)
                        self.assertAlmostEqual(max(xs), 12.5)
                    elif fmt == 'glb':
                        self.assertEqual(data[:4], b'glTF')
                        length, kind = struct.unpack_from('<II', data, 12)
                        self.assertEqual(kind, 0x4E4F534A)
                        document = json.loads(data[20:20 + length])
                        self.assertIn('shown assembly', [node.get('name') for node in document['nodes']])
                        self.assertTrue(document['materials'])
                        for material in document['materials']:
                            self.assertEqual(material['pbrMetallicRoughness']['baseColorFactor'], [1, 0, 0, 0.25])


if __name__ == '__main__':
    unittest.main()
