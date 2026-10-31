import importlib.util
from pathlib import Path
import sys
import unittest

RUNNER_DIRECTORY = Path(__file__).resolve().parents[2] / 'python'
sys.path.insert(0, str(RUNNER_DIRECTORY))
HAS_BUILD123D = importlib.util.find_spec('build123d') is not None


def fact(entity, name):
    found = [item for item in entity['facts'] if item['name'] == name]
    return found[0]['value'] if found else None


@unittest.skipUnless(HAS_BUILD123D, 'needs the build123d environment')
class EntityFactsTests(unittest.TestCase):
    def setUp(self):
        from ocp_tessellate.tessellator import cache
        cache.clear()

    def tessellate(self, *objects):
        from runner import tessellate
        return tessellate([
            {'object': obj, 'name': f'part{index}', 'color': None, 'alpha': 1.0}
            for index, obj in enumerate(objects)
        ])

    def facts(self, obj):
        instance = self.tessellate(obj)['instances'][0]
        self.assertIn('facts', instance)
        return instance['facts']

    def test_box_faces_are_planes_with_outward_normals(self):
        from build123d import Box
        faces = self.facts(Box(10, 20, 30))['faces']
        self.assertEqual([face['type'] for face in faces], ['PLANE'] * 6)
        self.assertAlmostEqual(sum(fact(face, 'area') for face in faces), 2200)
        centroids = [fact(face, 'centroid') for face in faces]
        middle = [sum(axis) / len(centroids) for axis in zip(*centroids)]
        for face in faces:
            outward = [c - m for c, m in zip(fact(face, 'centroid'), middle)]
            self.assertGreater(sum(o * n for o, n in zip(outward, fact(face, 'normal'))), 0)

    def test_hole_rim_is_a_full_circle_between_its_plane_and_cylinder(self):
        from build123d import Box, BuildPart, Hole
        with BuildPart() as part:
            Box(20, 20, 10)
            Hole(3)
        facts = self.facts(part.part)
        rims = [
            edge for edge in facts['edges']
            if edge['type'] == 'CIRCLE' and fact(edge, 'center')[2] == 5
        ]
        self.assertEqual(len(rims), 1)
        rim = rims[0]
        self.assertAlmostEqual(fact(rim, 'radius'), 3)
        self.assertAlmostEqual(fact(rim, 'sweep'), 360)
        self.assertEqual([abs(value) for value in fact(rim, 'axis')], [0, 0, 1])
        self.assertEqual(fact(rim, 'class'), 'feature')
        neighbours = sorted(facts['faces'][index]['type'] for index in fact(rim, 'faces'))
        self.assertEqual(neighbours, ['CYLINDER', 'PLANE'])

    def test_edges_are_classed_by_how_their_faces_meet(self):
        from build123d import Axis, Box, BuildPart, Hole, fillet
        with BuildPart() as part:
            Box(20, 20, 10)
            Hole(3)
            fillet(part.edges().filter_by(Axis.Z), 2)
        classes = {fact(edge, 'class') for edge in self.facts(part.part)['edges']}
        self.assertEqual(classes, {'feature', 'tangent', 'seam'})

    def test_facts_follow_the_order_the_viewer_draws(self):
        from build123d import Cone, Sphere, Torus
        for obj in (Sphere(5), Torus(10, 2), Cone(5, 2, 8)):
            with self.subTest(type(obj).__name__):
                instance = self.tessellate(obj)['instances'][0]
                facts = instance['facts']
                self.assertEqual(len(facts['faces']), instance['face_types']['shape'][0])
                self.assertEqual(len(facts['edges']), instance['edge_types']['shape'][0])
                for entities in (facts['faces'], facts['edges']):
                    ordinals = [entity['ordinal'] for entity in entities]
                    self.assertEqual(ordinals, sorted(set(ordinals)))

    def test_round_surfaces_report_their_defining_dimensions(self):
        from build123d import Cone, Sphere, Torus
        sphere = self.facts(Sphere(5))['faces'][0]
        self.assertEqual(sphere['type'], 'SPHERE')
        self.assertAlmostEqual(fact(sphere, 'radius'), 5)
        torus = self.facts(Torus(10, 2))['faces'][0]
        self.assertAlmostEqual(fact(torus, 'majorRadius'), 10)
        self.assertAlmostEqual(fact(torus, 'minorRadius'), 2)
        cone = next(face for face in self.facts(Cone(5, 2, 8))['faces'] if face['type'] == 'CONE')
        self.assertIsNotNone(fact(cone, 'apex'))
        self.assertGreater(fact(cone, 'halfAngle'), 0)

    def test_each_instance_gets_its_own_facts(self):
        from build123d import Box, Cylinder
        instances = self.tessellate(Box(1, 1, 1), Cylinder(2, 4))['instances']
        self.assertEqual(len(instances[0]['facts']['faces']), 6)
        self.assertEqual(
            sorted(face['type'] for face in instances[1]['facts']['faces']),
            ['CYLINDER', 'PLANE', 'PLANE'],
        )

    def test_identical_shapes_share_facts_despite_the_mesh_cache(self):
        from build123d import Box
        instances = self.tessellate(Box(1, 2, 3), Box(1, 2, 3))['instances']
        self.assertEqual(len(instances), 2)
        self.assertEqual(instances[0]['facts'], instances[1]['facts'])

    def test_facts_are_dropped_rather_than_misaligned(self):
        from build123d import Box
        from entity_facts import entity_facts
        from ocp_tessellate.convert import tessellate_group, to_ocpgroup
        group, instances = to_ocpgroup(Box(1, 1, 1), names=['box'], colors=[None], alphas=[1.0])
        meshed, _, _ = tessellate_group(group, instances, {})
        self.assertIsNotNone(entity_facts(instances, meshed)[0])
        meshed[0]['face_types'] = list(meshed[0]['face_types'])[::-1][:5]
        self.assertEqual(entity_facts(instances, meshed), [None])


if __name__ == '__main__':
    unittest.main()
