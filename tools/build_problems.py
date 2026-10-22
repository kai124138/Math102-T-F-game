#!/usr/bin/env python3
"""
Build hw/problems.js (the Homework page's data) from the MATH 102 question bank and answer key.

    python3 tools/build_problems.py [question-bank.md] [answer-key.md] [out.js]

Defaults: ../question-bank.md, ../answer-key.md (next to this repo) and hw/problems.js.
Problems come from question-bank.md (### <ID> headings); answers and solutions come from
answer-key.md under the same IDs ("**Answer.**" and "**Solution.**" paragraphs).
"""

import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
BANK = Path(sys.argv[1]) if len(sys.argv) > 1 else REPO.parent / "question-bank.md"
KEY = Path(sys.argv[2]) if len(sys.argv) > 2 else REPO.parent / "answer-key.md"
OUT = Path(sys.argv[3]) if len(sys.argv) > 3 else REPO / "hw" / "problems.js"

# Homework sets shown in the app, in assignment order. L53 was handed out with HW 10/13
# but is outside Midterm 1, so it starts switched off.
SETS = [
    {"id": "H0924", "label": "HW 9/24", "topic": "Block multiplication, block inverses, trace", "default": True},
    {"id": "H0929", "label": "HW 9/29", "topic": "Matrix products, polynomials, elementary matrices, similarity", "default": True},
    {"id": "H1001", "label": "HW 10/1", "topic": "Block determinants, Schur complements", "default": True},
    {"id": "H1006", "label": "HW 10/6", "topic": "Full-rank factorization, column space, rank", "default": True},
    {"id": "H1008", "label": "HW 10/8", "topic": "Rank, similarity invariants, independence", "default": True},
    {"id": "H1013", "label": "HW 10/13", "topic": "Real similarity of real matrices (Thm 9.6.3)", "default": True},
    {"id": "L53", "label": "HW 10/13 · Math 18 review", "topic": "Diagonalization (Lay §5.3). Not on Midterm 1", "default": False},
]
SET_IDS = {s["id"] for s in SETS}

HEAD1 = re.compile(r"^# (\S+) — ")
HEAD2 = re.compile(r"^## (.+?) · (.*)$")
HEAD3 = re.compile(r"^### (\S+)(.*)$")
META = re.compile(r"^`scope:(\S+?)`\s+`type:(\S+?)`")


def tidy(lines):
    """Join lines, drop editorial transcription notes, trim blank runs."""
    paras = "\n".join(lines).strip().split("\n\n")
    keep = []
    for p in paras:
        if re.match(r"^\((Text from|= 1st-ed)|^Scope note:|^Related: `", p.strip()):
            continue
        p = re.sub(r"\s*\(Transcription checked:[^)]*\)", "", p)
        if p.strip() and p.strip() != "---":
            keep.append(p.strip())
    return "\n\n".join(keep)


def parse_bank(text):
    records, setups, titles = {}, {}, {}
    cur_set = cur_prob = None
    target = None  # ("setup", problem) or ("rec", id)
    for line in text.split("\n"):
        if m := HEAD1.match(line):
            cur_set, target = m.group(1), None
            continue
        if m := HEAD2.match(line):
            cur_prob = m.group(1).strip()
            titles[cur_prob] = m.group(2).strip()
            setups[cur_prob] = []
            target = ("setup", cur_prob)
            continue
        if m := HEAD3.match(line):
            rid = m.group(1)
            records[rid] = {"id": rid, "set": cur_set, "problem": cur_prob, "flag": m.group(2).strip(),
                            "scope": "", "type": "", "body": []}
            target = ("rec", rid)
            continue
        if line.startswith("#"):
            target = None
            continue
        if target and target[0] == "rec":
            if m := META.match(line):
                records[target[1]]["scope"], records[target[1]]["type"] = m.group(1), m.group(2)
            else:
                records[target[1]]["body"].append(line)
        elif target and target[0] == "setup" and line.startswith(">"):
            # Only the quoted handout text is shared setup; other notes are editorial.
            setups[target[1]].append(re.sub(r"^> ?", "", line))
    return records, setups, titles


def parse_key(text):
    out, cur = {}, None
    for line in text.split("\n"):
        if m := HEAD3.match(line):
            cur = m.group(1)
            out[cur] = []
            continue
        if re.match(r"^#{1,2} ", line):
            cur = None
            continue
        if cur:
            out[cur].append(line)
    split = {}
    for rid, lines in out.items():
        body = "\n".join(lines).strip()
        m = re.match(r"^\*\*Answer\.\*\*\s*([\s\S]*?)\n\s*\*\*Solution\.\*\*\s*([\s\S]*)$", body)
        if not m:
            m2 = re.match(r"^\*\*Answer\.\*\*\s*([\s\S]*)$", body)
            if not m2:
                raise SystemExit(f"answer-key.md: {rid} has no **Answer.** paragraph")
            split[rid] = (m2.group(1).strip(), "")
        else:
            split[rid] = (m.group(1).strip(), m.group(2).strip())
    return split


def part_label(rid, problem):
    """H0929-01.a -> 'Part a'; H1006-12.P3.26.g3 -> 'P.3.26 · Step 3'; L53-08 -> 'Exercise 8'."""
    if rid.startswith("L53-"):
        return f"Exercise {int(rid.split('-')[1].split('.')[0])}"
    rest = rid[len(problem):].lstrip(".") if rid.startswith(problem) else ""
    if not rest:
        return ""
    bits = rest.split(".")
    if bits[0].startswith("P") and bits[0][1:].isdigit() and len(bits) >= 2 and bits[1].isdigit():
        label = f"P.{bits[0][1:]}.{bits[1]}"
        if len(bits) > 2 and bits[2].startswith("g"):
            label += f" · Step {bits[2][1:]}"
        return label
    return "Part " + ".".join(bits)


def problem_title(problem, raw):
    raw = re.sub(r"\s*\((?:p|pp)\.[^)]*\)", "", raw).strip()
    raw = re.sub(r"\s*\(textbook ([^)]*)\)", r", textbook \1", raw)
    return raw


def main():
    records, setups, titles = parse_bank(BANK.read_text(encoding="utf-8"))
    key = parse_key(KEY.read_text(encoding="utf-8"))
    # "### PF-L3.2.17 · Lemma 3.2.17" -> {"PF-L3.2.17": "Lemma 3.2.17"}
    pf_titles = {rid: r["flag"].lstrip("· ").strip() for rid, r in records.items() if rid.startswith("PF-")}

    problems, missing, skipped = [], [], []
    for rid, r in records.items():
        if r["set"] not in SET_IDS:
            continue
        if r["scope"] == "excluded" or "✱" in r["flag"]:
            skipped.append(rid)
            continue
        if rid not in key:
            missing.append(rid)
            continue
        answer, solution = key[rid]
        if re.match(r"^See (the )?(proof|solution)\.?$", answer, re.I):
            answer = ""
        # "Related: `PF-…`" marks a homework problem that is also a possible midterm proof.
        related = [pf_titles.get(m, m) for m in re.findall(r"Related: `(PF-[^`]+)`", "\n".join(r["body"]))]
        # Guided-proof steps (…P3.26.g3) refer to a parent record's proof; show it as context.
        parent = rid.rsplit(".", 1)[0] if "." in rid else None
        context = tidy(records[parent]["body"]) if parent in records and parent != rid else ""
        problems.append({
            "id": rid,
            "set": r["set"],
            "problem": r["problem"],
            "problemTitle": problem_title(r["problem"], titles.get(r["problem"], "")),
            "part": part_label(rid, r["problem"]),
            "type": r["type"],
            "scope": r["scope"],
            "setup": tidy(setups.get(r["problem"], [])),
            "context": context,
            "contextLabel": part_label(parent, r["problem"]) if context else "",
            "text": tidy(r["body"]),
            "midtermProof": related,
            "answer": answer,
            "solution": solution,
        })

    if missing:
        raise SystemExit(f"no answer-key entry for: {', '.join(missing)}")
    empty = [p["id"] for p in problems if not p["text"] or not (p["answer"] or p["solution"])]
    if empty:
        raise SystemExit(f"empty problem or solution text for: {', '.join(empty)}")

    counts = {s["id"]: sum(p["set"] == s["id"] for p in problems) for s in SETS}
    sets = [{**s, "count": counts[s["id"]]} for s in SETS]
    payload = {"sets": sets, "problems": problems}
    OUT.write_text(
        "/* Generated by tools/build_problems.py from question-bank.md and answer-key.md. Do not edit by hand. */\n"
        "window.HW_DATA = " + json.dumps(payload, ensure_ascii=False, indent=1) + ";\n",
        encoding="utf-8",
    )
    print(f"wrote {OUT.name}: {len(problems)} problems · " + " · ".join(f"{k} {v}" for k, v in counts.items()))
    print(f"skipped (excluded by the professor): {', '.join(skipped) or 'none'}")


if __name__ == "__main__":
    main()
