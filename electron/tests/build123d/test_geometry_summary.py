import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

RUNNER_DIRECTORY = Path(__file__).resolve().parents[2] / 'python'
sys.path.insert(0, str(RUNNER_DIRECTORY))
HAS_BUILD123D = importlib.util.find_spec('build123d') is not None


@unittest.skipUnless(HAS_BUILD123D, 'needs the build123d environment')
class GeometrySummaryTests(unittest.TestCase):
    def summary(self, *objects, **kwargs):
        from ocp_tessellate.convert import to_ocpgroup
        from geometry_summary import summarize_geometry
        return summarize_geometry(*to_ocpgroup(*objects, **kwargs))

    def test_box_has_exact_mass_properties(self):
        from build123d import Box
        summary = self.summary(Box(10, 20, 30), names=['plate'])
        part = summary['parts'][0]
        self.assertEqual(part['name'], 'plate')
        self.assertEqual(part['bounds'], {'min': [-5, -10, -15], 'max': [5, 10, 15]})
        self.assertEqual(part['solidCount'], 1)
        self.assertTrue(part['valid'])
        self.assertTrue(part['shellsClosed'])
        self.assertAlmostEqual(part['volume'], 6000)
        self.assertAlmostEqual(part['surfaceArea'], 2200)
        for value in part['centerOfMass']:
            self.assertAlmostEqual(value, 0)
        self.assertAlmostEqual(summary['overall']['volumeSum'], 6000)

    def test_nested_rotated_assemblies_use_world_locations(self):
        from build123d import Box, Compound, Pos, Rot
        box = Box(2, 4, 6)
        child = Compound(children=[box])
        child.location = Pos(10, 0, 0) * Rot(Z=90)
        root = Compound(children=[child])
        root.location = Pos(0, 20, 0)
        part = self.summary(root)['parts'][0]
        for actual, expected in zip(part['bounds']['min'], [8, 19, -3]):
            self.assertAlmostEqual(actual, expected)
        for actual, expected in zip(part['bounds']['max'], [12, 21, 3]):
            self.assertAlmostEqual(actual, expected)
        for actual, expected in zip(part['centerOfMass'], [10, 20, 0]):
            self.assertAlmostEqual(actual, expected)

    def test_overlap_totals_are_part_sums(self):
        from build123d import Box
        summary = self.summary(Box(2, 2, 2), Box(2, 2, 2))
        self.assertEqual(summary['overall']['solidCount'], 2)
        self.assertAlmostEqual(summary['overall']['volumeSum'], 16)
        self.assertAlmostEqual(summary['overall']['surfaceAreaSum'], 48)

    def test_open_shell_has_no_enclosed_volume(self):
        from build123d import Box, Shell
        shell = Shell(Box(2, 2, 2).faces()[:-1])
        part = self.summary(shell)['parts'][0]
        self.assertTrue(part['valid'])
        self.assertFalse(part['shellsClosed'])
        self.assertEqual(part['solidCount'], 0)
        self.assertIsNone(part['volume'])
        self.assertIsNone(part['centerOfMass'])

    def test_solid_with_loose_face_has_no_volume(self):
        from build123d import Box, Compound, Pos, Rectangle
        shape = Compound([Box(2, 2, 2), Pos(10, 0, 0) * Rectangle(2, 2).face()])
        from geometry_summary import _measure
        part = _measure('mixed', shape)
        self.assertIsNone(self.summary(shape)['overall']['volumeSum'])
        self.assertEqual(part['solidCount'], 1)
        self.assertIsNone(part['volume'])
        self.assertIsNone(part['centerOfMass'])

    def test_builder_lists_and_wire_geometry_follow_preview_conversion(self):
        from build123d import Box, BuildPart, Line
        with BuildPart() as builder:
            Box(1, 2, 3)
        summary = self.summary(builder, [Box(2, 2, 2)], Line((0, 0, 0), (5, 0, 0)))
        self.assertEqual(len(summary['parts']), 4)
        self.assertAlmostEqual(summary['parts'][0]['volume'], 6)
        wire = summary['parts'][-1]
        self.assertEqual(wire['solidCount'], 0)
        self.assertIsNone(wire['shellsClosed'])
        self.assertIsNone(wire['volume'])

    def test_inline_wire_keeps_its_own_location(self):
        from build123d import Line, Pos
        part = self.summary(Pos(10, 20, 30) * Line((0, 0, 0), (5, 0, 0)))['parts'][0]
        self.assertEqual(part['bounds'], {'min': [10, 20, 30], 'max': [15, 20, 30]})

    def test_invalid_solid_does_not_report_mass(self):
        from build123d import Box, Shell, Solid
        from OCP.BRep import BRep_Builder
        from OCP.TopoDS import TopoDS_Solid
        raw = TopoDS_Solid()
        builder = BRep_Builder()
        builder.MakeSolid(raw)
        builder.Add(raw, Shell(Box(2, 2, 2).faces()[:-1]).wrapped)
        part = self.summary(Solid(raw))['parts'][0]
        self.assertFalse(part['valid'])
        self.assertIsNone(part['volume'])
        self.assertIsNone(part['centerOfMass'])

    def test_unmeasurable_part_does_not_discard_other_measurements(self):
        from build123d import Box
        from geometry_summary import summarize_geometry
        from ocp_tessellate.convert import to_ocpgroup
        group, instances = to_ocpgroup(Box(1, 1, 1), Box(2, 2, 2))
        instances[group.objects[1].ref]['obj'] = None
        summary = summarize_geometry(group, instances)
        self.assertEqual(summary['parts'][0]['kind'], 'brep')
        self.assertEqual(summary['parts'][1]['kind'], 'unavailable')
        self.assertIsNone(summary['overall'])

    def test_ordinary_preview_never_calls_geometry_analysis(self):
        from build123d import Box
        from runner import tessellate
        from unittest.mock import patch
        entry = {'object': Box(1, 2, 3), 'name': 'box', 'color': None, 'alpha': None}
        with patch('geometry_summary.summarize_geometry', side_effect=AssertionError('unexpected geometry analysis')):
            self.assertNotIn('geometry', tessellate([entry]))
            self.assertNotIn('geometry', tessellate([entry], False))

    def test_runner_analysis_is_opt_in_and_does_not_execute_source_twice(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            script = directory / 'main.py'
            script.write_text("from build123d import Box\nprint('executed once')\nshow(Box(1, 2, 3))\n")
            request = {'script': str(script), 'cwd': temporary, 'sysPath': [temporary], 'overridesPath': None}
            for flag in [None, False, True]:
                with self.subTest(flag=flag):
                    current = {**request, **({'geometrySummary': flag} if flag is not None else {})}
                    response = subprocess.run([sys.executable, str(RUNNER_DIRECTORY / 'runner.py')], input=json.dumps(current), capture_output=True, text=True, check=True, env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'})
                    result = json.loads(response.stdout)
                    self.assertTrue(result['ok'], result.get('error'))
                    self.assertEqual(result['logs'], 'executed once\n')
                    self.assertEqual('geometry' in result, flag is True)
                    if flag:
                        self.assertAlmostEqual(result['geometry']['parts'][0]['volume'], 6)


if __name__ == '__main__':
    unittest.main()
