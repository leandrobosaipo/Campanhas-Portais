"""Verifica a documentação consumida pelos agentes, sem executar jobs."""
import json
import os
from pathlib import Path
import re
import unittest
from urllib.request import urlopen

from main import build_openapi_document


ROOT = Path(__file__).resolve().parents[2]
POLICY = Path(__file__).with_name("apresentacao-retroativos.md")
PUBLIC = os.environ.get("ADOPS_DOCS_PUBLIC_CHECK") == "1"


def public_json(path):
    with urlopen("https://adops-api.codigo5.com.br" + path, timeout=25) as response:
        return json.load(response)


class RetroactivePresentationDocs(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.document = public_json("/api/openapi.json") if PUBLIC else build_openapi_document()

    def test_full_openapi_uses_the_single_policy(self):
        doc = self.document
        policy = POLICY.read_text(encoding="utf-8")
        self.assertEqual(doc["info"]["description"].count(policy), 1)
        for heading in ("Regra", "Contra-regra", "Conferência antes da entrega"):
            self.assertIn("## " + heading, policy)
        link = doc["externalDocs"]
        self.assertTrue(link["url"].endswith("/main/" + str(POLICY.relative_to(ROOT))))
        for route in (
            "/api/insertions/{id}/capture-proof/jobs",
            "/api/internal/capture-proof-candidates/{candidateId}/audit",
            "/api/internal/capture-proof-candidates/{candidateId}/promote",
            "/api/pi-site-exports/jobs",
        ):
            self.assertEqual(doc["paths"][route]["post"]["externalDocs"], link)
        op = doc["paths"]["/api/insertions/{id}/capture-proof/jobs"]["post"]
        for example in op["requestBody"]["content"]["application/json"]["examples"].values():
            self.assertIs(example["value"]["candidate"], True)
            self.assertIs(example["value"]["promote"], False)

    def test_agent_and_ops_guide_resolve_the_canonical_file(self):
        for relative in ("AGENTS.md", "README.md", "docs/START_HERE_ADOPS.md",
                         "docs/prints-retroativos.md", "docs/adops/retroactive-recovery-harness.md",
                         "docs/adops/ops-api-runbook.md", "docs/adops/audit-checklist-api.md"):
            guide = ROOT / relative
            targets = re.findall(r"\]\(([^)]+apresentacao-retroativos\.md)\)", guide.read_text())
            self.assertEqual([(guide.parent / url).resolve() for url in targets], [POLICY], relative)
        ops = (ROOT / "artifacts/api-server/src/routes/ops.ts").read_text()
        self.assertIn(self.document["externalDocs"]["url"], ops)
        start = ops.index('id: "gerar-print-data-especifica"')
        workflow = ops[start:ops.index('id: "gerar-retroativos-campanha"', start)]
        self.assertIn("retroPolicyUrl", workflow)
        request = re.search(r"-d '([^']+)'", workflow)
        self.assertIsNotNone(request)
        body = json.loads(request.group(1))
        self.assertIs(body["candidate"], True)
        self.assertIs(body["promote"], False)
        self.assertNotIn('command("print-single")', workflow)

    @unittest.skipUnless(PUBLIC, "Conferência do deploy público opcional")
    def test_deployed_operations_guide(self):
        ops = public_json("/api/ops/openapi.json")
        self.assertEqual(ops["externalDocs"], self.document["externalDocs"])
        printable = ops["paths"]["/api/ops/jobs/print-single"]["post"]
        self.assertIs(printable["requestBody"]["content"]["application/json"]["example"]["replace"], False)
        quickstart = public_json("/api/ops/quickstart")
        workflow = next(w for w in quickstart["workflows"] if w["id"] == "gerar-print-data-especifica")
        self.assertIn(ops["externalDocs"]["url"], workflow["when"])
        commands = [step["command"] or "" for step in workflow["steps"]]
        self.assertTrue(any('"candidate":true,"promote":false' in cmd for cmd in commands))
        self.assertFalse(any("/ops/jobs/print-single" in cmd for cmd in commands))


if __name__ == "__main__":
    unittest.main()
