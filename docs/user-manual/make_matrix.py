"""Turns access-matrix.json (probed against the live API by
apps/web/scripts/manual/capture.spec.ts) into the manual's access table."""

import json

ROLES = ["founder", "admin", "operator", "field"]
matrix = json.load(open("access-matrix.json"))

print(r"\begin{tabular}{@{}lcccc@{}}")
print(r"\toprule")
print(r"\textbf{Area} & \textbf{Founder} & \textbf{Admin} & \textbf{Operator} & \textbf{Field} \\")
print(r"\midrule")
for area, by_role in matrix.items():
    cells = []
    for role in ROLES:
        status = by_role[role]
        cells.append(r"\yes" if status == 200 else r"\no")
    note = r"\textsuperscript{*}" if area in {"Orders", "Invoices", "Delivery/pickup jobs"} else ""
    print(f"{area}{note} & " + " & ".join(cells) + r" \\")
print(r"\bottomrule")
print(r"\end{tabular}")
