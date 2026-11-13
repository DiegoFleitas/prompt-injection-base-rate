import base64
import unittest
from email.message import EmailMessage

from scripts.f5.extract_eml import extract, record_id

RAW_QP = (
    "From: a@example.test\r\n"
    "Message-ID: <2@example.test>\r\n"
    "MIME-Version: 1.0\r\n"
    'Content-Type: text/plain; charset="utf-8"\r\n'
    "Content-Transfer-Encoding: quoted-printable\r\n"
    "\r\n"
    "hola =C2=A0mundo\r\n"
)

RAW_B64 = (
    "From: a@example.test\r\n"
    "Message-ID: <3@example.test>\r\n"
    "MIME-Version: 1.0\r\n"
    'Content-Type: text/plain; charset="utf-8"\r\n'
    "Content-Transfer-Encoding: base64\r\n"
    "\r\n"
    + base64.b64encode("hola\u200b mundo".encode()).decode()
    + "\r\n"
)


def build_eml(headers, parts, attachments=()):
    msg = EmailMessage()
    for key, value in headers.items():
        msg[key] = value
    if parts:
        first_ctype, first_text = parts[0]
        msg.set_content(first_text, subtype=first_ctype.split("/", 1)[1])
        for ctype, text in parts[1:]:
            msg.add_alternative(text, subtype=ctype.split("/", 1)[1])
    for ctype, payload in attachments:
        maintype, subtype = ctype.split("/", 1)
        msg.add_attachment(payload, maintype=maintype, subtype=subtype,
                           filename="fixture.bin")
    return msg


class ExtractTests(unittest.TestCase):
    salt = "fixture-salt"
    self_addresses = {"me@example.test"}

    def test_multipart_alternative_keeps_both_parts(self):
        msg = build_eml(
            headers={"From": "a@example.test", "Message-ID": "<1@example.test>"},
            parts=[("text/plain", "hola\u200b mundo"), ("text/html", "<p>hola</p>")],
        )
        rows = extract(msg, self.salt, self.self_addresses)
        self.assertEqual(rows["plain"], "hola\u200b mundo")
        self.assertIn("<p>hola</p>", rows["html"])

    def test_quoted_printable_decodes_nbsp(self):
        rows = extract(RAW_QP.encode(), self.salt, self.self_addresses)
        self.assertEqual(rows["plain"], "hola \u00a0mundo")

    def test_base64_decodes_zero_width_space(self):
        rows = extract(RAW_B64.encode(), self.salt, self.self_addresses)
        self.assertEqual(rows["plain"], "hola\u200b mundo")

    def test_attachment_is_hashed_not_extracted(self):
        msg = build_eml(
            headers={"From": "a@example.test", "Message-ID": "<4@example.test>"},
            parts=[("text/plain", "cuerpo")],
            attachments=[("application/pdf", b"%PDF-1.4 fixture")],
        )
        rows = extract(msg, self.salt, self.self_addresses)
        self.assertEqual(len(rows["attachments"]), 1)
        self.assertEqual(rows["attachments"][0]["ctype"], "application/pdf")
        self.assertEqual(len(rows["attachments"][0]["sha256"]), 16)
        self.assertNotIn("%PDF", rows["plain"])

    def test_missing_message_id_falls_back_to_header_hash(self):
        rec_a = {"headers": {"from_hash": "deadbeefdeadbeef"}, "plain": "x"}
        rec_b = {"headers": {"from_hash": "deadbeefdeadbeef"}, "plain": "x"}
        self.assertEqual(record_id(rec_a, None), record_id(rec_b, None))
        self.assertEqual(len(record_id(rec_a, None)), 16)

    def test_self_sent_is_flagged(self):
        msg = build_eml(
            headers={"From": "Me <ME@example.test>", "Message-ID": "<5@example.test>"},
            parts=[("text/plain", "nota")],
        )
        rows = extract(msg, self.salt, self.self_addresses)
        self.assertEqual(rows["headers"]["self"], 1)


if __name__ == "__main__":
    unittest.main()
