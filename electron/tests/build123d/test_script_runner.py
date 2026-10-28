import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


RUNNER_DIRECTORY = Path(__file__).resolve().parents[2] / 'python'
DRIVER = """
import json
import sys
sys.path.insert(0, sys.argv[1])
from script_runner import execute, read_request
payload = execute(read_request(), lambda shown: {"ok": True, "objects": [entry["object"] for entry in shown]})
print(json.dumps(payload))
"""


class ScriptRunnerTests(unittest.TestCase):
    def run_entry(self, entry, request):
        return subprocess.run(
            [sys.executable, str(RUNNER_DIRECTORY / entry)],
            input=json.dumps(request),
            env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'},
            capture_output=True,
            text=True,
            check=True,
        )

    def request(self, main="main.py", overrides_path=None):
        return {
            "script": str(self.project / main),
            "cwd": str(self.project),
            "sysPath": [str(self.project)],
            "overridesPath": overrides_path,
        }

    def test_exporter_rejects_an_unsupported_format_with_a_complete_payload(self):
        result = self.run_entry('exporter.py', {**self.request(), 'format': 'unsupported', 'output': 'model.out'})
        self.assertEqual(json.loads(result.stdout), {
            'ok': False, 'error': 'Unsupported export format: unsupported', 'logs': '', 'duration': 0,
        })

    @unittest.skipUnless(importlib.util.find_spec('build123d'), 'needs the build123d environment')
    def test_runner_builds_the_requested_script_from_another_directory(self):
        self.write("main.py", "from build123d import Box\nshow(Box(1, 2, 3))\n")
        payload = json.loads(self.run_entry('runner.py', self.request()).stdout)
        self.assertTrue(payload['ok'], payload.get('error'))
        self.assertEqual(len(payload['instances']), 1)
        self.assertEqual(payload['instances'][0]['triangles']['shape'], [36])

    @unittest.skipUnless(importlib.util.find_spec('build123d'), 'needs the build123d environment')
    def test_runner_waiting_for_a_request_exits_when_its_parent_closes_stdin(self):
        result = subprocess.run(
            [sys.executable, str(RUNNER_DIRECTORY / 'runner.py')],
            input='',
            env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'},
            capture_output=True,
            text=True,
            timeout=60,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, '')

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.project = Path(self.temporary.name) / "project"
        self.project.mkdir()

    def write(self, relative, content):
        path = self.project / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        return path

    def run_script(self, main="main.py", overrides=None):
        manifest = Path(self.temporary.name) / "overrides.json"
        manifest.write_text(
            json.dumps({str(self.project / path): source for path, source in (overrides or {}).items()}),
            encoding="utf-8",
        )
        result = subprocess.run(
            [sys.executable, "-c", DRIVER, str(RUNNER_DIRECTORY)],
            input=json.dumps(self.request(main, str(manifest))),
            cwd=self.temporary.name,
            env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
            text=True,
            capture_output=True,
            check=True,
        )
        return json.loads(result.stdout)

    def assert_objects(self, payload, objects):
        self.assertTrue(payload["ok"], payload.get("error"))
        self.assertEqual(payload["objects"], objects)

    def test_unsaved_package_module_keeps_saved_initializer_and_sibling(self):
        self.write("pkg/__init__.py", "from .constants import offset\n")
        self.write("pkg/constants.py", "offset = 3\n")
        module = self.write("pkg/part.py", "value = 1\n")
        self.write("main.py", "from pkg import offset\nfrom pkg.part import value\nshow(offset + value)\n")
        self.assert_objects(self.run_script(overrides={"pkg/part.py": "value = 7\n"}), [10])
        self.assertEqual(module.read_text(), "value = 1\n")

    def test_unsaved_initializer_keeps_saved_siblings_and_relative_imports(self):
        self.write("pkg/__init__.py", "offset = 1\n")
        self.write("pkg/part.py", "value = 4\n")
        self.write("main.py", "from pkg import value\nshow(value)\n")
        self.assert_objects(self.run_script(overrides={"pkg/__init__.py": "from .part import value\n"}), [4])

    def test_new_unsaved_module_in_saved_package(self):
        self.write("pkg/__init__.py", "")
        self.write("main.py", "from pkg.part import value\nshow(value)\n")
        self.assert_objects(self.run_script(overrides={"pkg/part.py": "value = 11\n"}), [11])
        self.assertFalse((self.project / "pkg/part.py").exists())

    def test_new_unsaved_package_and_namespace_package(self):
        self.write("main.py", "from regular.part import a\nfrom namespace.part import b\nshow(a + b)\n")
        self.assert_objects(self.run_script(overrides={
            "regular/__init__.py": "",
            "regular/part.py": "a = 5\n",
            "namespace/part.py": "b = 8\n",
        }), [13])

    def test_nested_main_and_modules_keep_original_file_and_asset_paths(self):
        self.write("main.py", "show('unused')\n")
        self.write("nested/main.py", "show('saved')\n")
        self.write("nested/part.py", "value = 'saved'\n")
        self.write("nested/beside.txt", "beside")
        self.write("root.txt", "root")
        self.assert_objects(self.run_script(main="nested/main.py", overrides={
            "nested/main.py": "from pathlib import Path\nimport part\nshow(Path(__file__).name, Path(__file__).with_name('beside.txt').read_text(), Path('root.txt').read_text(), part.value)\n",
            "nested/part.py": "from pathlib import Path\nvalue = Path(__file__).with_name('beside.txt').read_text()\n",
        }), ["main.py", "beside", "root", "beside"])

    def test_new_unsaved_main_runs_at_original_path(self):
        self.assert_objects(self.run_script(overrides={"main.py": "show(__file__)\n"}), [str(self.project / "main.py")])
        self.assertFalse((self.project / "main.py").exists())

    def test_nested_script_sibling_precedes_project_root_override(self):
        self.write("nested/main.py", "from part import value\nshow(value)\n")
        self.write("nested/part.py", "value = 'sibling'\n")
        self.write("part.py", "value = 'root'\n")
        self.assert_objects(self.run_script(main="nested/main.py", overrides={
            "part.py": "value = 'unsaved root'\n",
        }), ["sibling"])

    def test_unsaved_traceback_names_original_file_and_source(self):
        self.write("main.py", "show('saved')\n")
        result = self.run_script(overrides={"main.py": "raise ValueError('unsaved failure')\n"})
        self.assertFalse(result["ok"])
        self.assertIn(str(self.project / "main.py"), result["error"])
        self.assertIn("raise ValueError('unsaved failure')", result["error"])

    def test_saved_modules_do_not_reuse_stale_bytecode(self):
        self.write("main.py", "import part\nshow(part.value)\n")
        module = self.write("part.py", "value = 1\n")
        subprocess.run([sys.executable, "-m", "py_compile", str(module)], check=True)
        stamp = module.stat().st_mtime
        module.write_text("value = 2\n", encoding="utf-8")
        os.utime(module, (stamp, stamp))
        self.assert_objects(self.run_script(), [2])


if __name__ == "__main__":
    unittest.main()
