"""Writes the Barbados golden holiday fixture from python `holidays`.

The fixture is bank-holidays-golden.fixture.json, read by
bank-holidays.golden.test.ts. This script is a regeneration aid only: CI
doesn't run it and Python isn't part of the toolchain.

Regenerate: python3 -m venv .venv && .venv/bin/pip install "holidays==0.109"
            .venv/bin/python generate-bank-holidays-golden.py bank-holidays-golden.fixture.json
"""
import json, sys, datetime, holidays
from holidays.countries.barbados import BarbadosStaticHolidays

specials = {}
for year, entries in BarbadosStaticHolidays.special_public_holidays.items():
    for month, day, name in (entries if isinstance(entries[0], tuple) else (entries,)):
        specials[datetime.date(year, month, day).isoformat()] = name

statutory = {}
for y in range(2020, 2051):
    dates = sorted(d.isoformat() for d in holidays.country_holidays("BB", years=y))
    statutory[str(y)] = [d for d in dates if d not in specials]

json.dump({
    "source": f"python holidays {holidays.__version__} (vacanza/holidays), country BB",
    "statutory": statutory,
    "oneOff": [{"date": d, "name": n} for d, n in sorted(specials.items())],
}, open(sys.argv[1], "w"), indent=2)
open(sys.argv[1], "a").write("\n")
