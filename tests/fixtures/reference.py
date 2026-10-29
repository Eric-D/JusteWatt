"""Moteur de référence (Python, stdlib seule) et données 100 % synthétiques.

Aucune mesure réelle : la consommation et la production sont générées par un
modèle déterministe (graine fixe). Lancer depuis ce dossier :
    python3 reference.py  ->  reference-synthetique.json
"""
import json, math, datetime as D
from zoneinfo import ZoneInfo

TZ = ZoneInfo('Europe/Paris'); UTC = D.timezone.utc
START = D.datetime(2024, 12, 31, 23, tzinfo=UTC)   # 1er janvier 2025, 00:00 heure de Paris
HOURS = [START + D.timedelta(hours=i) for i in range(8760)]

seed = 20250101
def rnd():
    """Générateur congruentiel : mêmes valeurs sur toutes les machines."""
    global seed
    seed = (seed * 1103515245 + 12345) % 2**31
    return seed / 2**31

# --- production par kWc : soleil géométrique (lat. 45°, toit 30° plein sud) × nébulosité du jour
LAT, TILT = math.radians(45), math.radians(30)
def pv_kwc(t, cloud):
    n = t.timetuple().tm_yday
    decl = math.radians(23.44) * math.sin(2 * math.pi * (284 + n) / 365)
    ha = math.radians(15 * (t.hour + 0.5 - 12))          # heure solaire ≈ UTC
    sin_el = math.sin(LAT) * math.sin(decl) + math.cos(LAT) * math.cos(decl) * math.cos(ha)
    if sin_el <= 0: return 0.0
    cos_inc = math.sin(LAT - TILT) * math.sin(decl) + math.cos(LAT - TILT) * math.cos(decl) * math.cos(ha)
    clear = 1.0 * 0.7 ** (1 / max(sin_el, 0.05)) ** 0.678  # kW/m², masse d'air
    return round(max(0.0, 1.15 * clear * max(cos_inc, 0) * cloud + 0.08 * cloud * sin_el), 5)

# --- consommation : talon + pics matin/soir + chauffage d'hiver + cumulus à 21-22 h
SHAPE = [.3,.25,.25,.25,.25,.3,.6,.9,.7,.5,.45,.5,.6,.5,.45,.45,.55,.8,1.1,1.2,1.0,.8,.6,.4]
load, pil, pv, lh, ld = [], [], [], [], []
day, cloud = None, 1.0
for t in HOURS:
    l = t.astimezone(TZ)
    if l.date() != day:
        day = l.date(); cloud = 0.15 + 0.85 * rnd() ** 0.7
    winter = 0.5 + 0.5 * math.cos(2 * math.pi * (l.timetuple().tm_yday - 15) / 365)
    p = 1.4 if l.hour == 21 else 0.6 if l.hour == 22 else 0.0
    load.append(round(SHAPE[l.hour] * (0.8 + 0.4 * rnd()) + 1.2 * winter * (0.6 + 0.4 * rnd()) + p, 5))
    pil.append(p); pv.append(pv_kwc(t, cloud)); lh.append(l.hour); ld.append(l.date().isoformat())

def sim(kwc, batt, pmax, router):
    soc = imp = exp = prod = 0.0; bank = 0.0; cur = None
    for i in range(len(HOURS)):
        if ld[i] != cur:
            cur = ld[i]; bank = sum(pil[j] for j in range(i, len(HOURS)) if ld[j] == cur) if router else 0
        p = pv[i] * kwc; prod += p
        net = p - (load[i] - (pil[i] if router else 0))
        if router and net > 0 and bank > 0: r = min(net, 2.4, bank); bank -= r; net -= r
        if router and lh[i] == 21 and bank > 0: net -= bank; bank = 0
        if net > 0: ch = min(net * 0.95, batt - soc, pmax); soc += ch; exp += net - ch / 0.95
        else: dis = min(-net, soc * 0.95, pmax); soc -= dis / 0.95; imp += -net - dis
    return prod, imp, exp

cases = []
for kwc, b, pm in ((6, 7.5, 4), (6, 0, 0), (3, 0, 0), (9, 10, 5)):
    for router in (True, False):
        pr, i, e = sim(kwc, b, pm, router)
        cases.append(dict(kwc=kwc, battery=b, pmax=pm, router=router, prod=pr, import_=i, export=e))
for c in cases: c['import'] = c.pop('import_')

json.dump(dict(start=START.isoformat(), tz='Europe/Paris', load=load, pilotable=pil, pvPerKwc=pv,
               localHour=lh, localDay=ld, cases=cases), open('reference-synthetique.json', 'w'))
print(f"conso {sum(load):.0f} kWh, production {sum(pv):.0f} kWh/kWc")
for c in cases: print(c)
