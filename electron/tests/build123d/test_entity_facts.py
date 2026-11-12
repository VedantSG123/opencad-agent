from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from pipeline_types import EntityFacts, InstanceFacts

RUNNER_DIRECTORY = Path(__file__).resolve().parents[2] / 'python'
sys.path.insert(0, str(RUNNER_DIRECTORY))
HAS_BUILD123D = importlib.util.find_spec('build123d') is not None


def value(entity: EntityFacts, name: str) -> object:
    return next(
        fact['value'] for fact in entity['facts'] if fact['name'] == name
    )


def number(entity: EntityFacts, name: str) -> float:
    found = value(entity, name)
    assert isinstance(found, float)
    return found


def vector(entity: EntityFacts, name: str) -> list[float]:
    found = value(entity, name)
    assert isinstance(found, list)
    return [float(item) for item in found]


def label(entity: EntityFacts, name: str) -> str:
    found = value(entity, name)
    assert isinstance(found, str)
    return found


def neighbours(entity: EntityFacts) -> list[int]:
    found = value(entity, 'faces')
    assert isinstance(found, list)
    return [int(item) for item in found]


@unittest.skipUnless(HAS_BUILD123D, 'needs the build123d environment')
class EntityFactsTests(unittest.TestCase):
    def setUp(self):
        from ocp_tessellate.tessellator import cache

        cache.clear()

    def mesh(self, *objects: object):
        from ocp_tessellate.convert import tessellate_group, to_ocpgroup

        group, instances = to_ocpgroup(*objects)
        meshed, _, _ = tessellate_group(group, instances, {})
        return instances, meshed

    def all_facts(self, *objects: object) -> list[InstanceFacts | None]:
        from entity_facts import entity_facts

        return entity_facts(*self.mesh(*objects))

    def facts(self, obj: object) -> InstanceFacts:
        found = self.all_facts(obj)[0]
        assert found is not None
        return found

    def test_runner_attaches_facts_to_each_instance(self):
        from build123d import Box, Cylinder

        from runner import tessellate

        result = tessellate(
            [
                {'object': obj, 'name': name, 'color': None, 'alpha': 1.0}
                for name, obj in (
                    ('box', Box(1, 1, 1)),
                    ('pin', Cylinder(1, 2)),
                )
            ]
        )
        instances = result['instances']
        assert isinstance(instances, list)
        self.assertEqual(len(instances), 2)
        for instance in instances:
            self.assertIn('facts', instance)

    def test_box_faces_are_planes_with_outward_normals(self):
        from build123d import Box

        faces = self.facts(Box(10, 20, 30))['faces']
        self.assertEqual([face['type'] for face in faces], ['PLANE'] * 6)
        self.assertAlmostEqual(
            sum(number(face, 'area') for face in faces), 2200
        )
        centroids = [vector(face, 'centroid') for face in faces]
        middle = [sum(axis) / len(centroids) for axis in zip(*centroids)]
        for face in faces:
            outward = [c - m for c, m in zip(vector(face, 'centroid'), middle)]
            self.assertGreater(
                sum(o * n for o, n in zip(outward, vector(face, 'normal'))), 0
            )

    def test_hole_rim_is_a_full_circle_between_its_plane_and_cylinder(self):
        from build123d import Box, BuildPart, Hole

        with BuildPart() as part:
            Box(20, 20, 10)
            Hole(3)
        facts = self.facts(part.part)
        rims = [
            edge
            for edge in facts['edges']
            if edge['type'] == 'CIRCLE' and vector(edge, 'center')[2] == 5
        ]
        self.assertEqual(len(rims), 1)
        rim = rims[0]
        self.assertAlmostEqual(number(rim, 'radius'), 3)
        self.assertAlmostEqual(number(rim, 'sweep'), 360)
        self.assertEqual(
            [abs(value) for value in vector(rim, 'axis')], [0, 0, 1]
        )
        self.assertEqual(label(rim, 'class'), 'feature')
        sides = sorted(
            facts['faces'][index]['type'] for index in neighbours(rim)
        )
        self.assertEqual(sides, ['CYLINDER', 'PLANE'])

    def test_edges_are_classed_by_how_their_faces_meet(self):
        from build123d import Axis, Box, BuildPart, Hole, fillet

        with BuildPart() as part:
            Box(20, 20, 10)
            Hole(3)
            fillet(part.edges().filter_by(Axis.Z), 2)
        classes = {
            label(edge, 'class') for edge in self.facts(part.part)['edges']
        }
        self.assertEqual(classes, {'feature', 'tangent', 'seam'})

    def test_facts_follow_the_order_the_viewer_draws(self):
        from build123d import Cone, Sphere, Torus

        from entity_facts import entity_facts

        for obj in (Sphere(5), Torus(10, 2), Cone(5, 2, 8)):
            with self.subTest(type(obj).__name__):
                instances, meshed = self.mesh(obj)
                facts = entity_facts(instances, meshed)[0]
                assert facts is not None
                self.assertEqual(
                    len(facts['faces']), len(meshed[0]['face_types'])
                )
                self.assertEqual(
                    len(facts['edges']), len(meshed[0]['edge_types'])
                )
                for entities in (facts['faces'], facts['edges']):
                    ordinals = [entity['ordinal'] for entity in entities]
                    self.assertEqual(ordinals, sorted(set(ordinals)))

    def test_round_surfaces_report_their_defining_dimensions(self):
        from build123d import Cone, Sphere, Torus

        sphere = self.facts(Sphere(5))['faces'][0]
        self.assertEqual(sphere['type'], 'SPHERE')
        self.assertAlmostEqual(number(sphere, 'radius'), 5)
        torus = self.facts(Torus(10, 2))['faces'][0]
        self.assertAlmostEqual(number(torus, 'majorRadius'), 10)
        self.assertAlmostEqual(number(torus, 'minorRadius'), 2)
        cone = next(
            face
            for face in self.facts(Cone(5, 2, 8))['faces']
            if face['type'] == 'CONE'
        )
        self.assertEqual(len(vector(cone, 'apex')), 3)
        self.assertGreater(number(cone, 'halfAngle'), 0)

    def test_each_instance_gets_its_own_facts(self):
        from build123d import Box, Cylinder

        box, cylinder = self.all_facts(Box(1, 1, 1), Cylinder(2, 4))
        assert box is not None and cylinder is not None
        self.assertEqual(len(box['faces']), 6)
        self.assertEqual(
            sorted(face['type'] for face in cylinder['faces']),
            ['CYLINDER', 'PLANE', 'PLANE'],
        )

    def test_identical_shapes_share_facts_despite_the_mesh_cache(self):
        from build123d import Box

        first, second = self.all_facts(Box(1, 2, 3), Box(1, 2, 3))
        self.assertIsNotNone(first)
        self.assertEqual(first, second)

    def test_facts_are_dropped_rather_than_misaligned(self):
        from build123d import Box

        from entity_facts import entity_facts

        instances, meshed = self.mesh(Box(1, 1, 1))
        self.assertIsNotNone(entity_facts(instances, meshed)[0])
        meshed[0]['face_types'] = meshed[0]['face_types'][::-1][:5]
        self.assertEqual(entity_facts(instances, meshed), [None])


if __name__ == '__main__':
    unittest.main()
