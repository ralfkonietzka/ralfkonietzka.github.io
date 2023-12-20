from os.path import extsep, splitext

import pandas as pd
import astropy.units as u
from astropy.coordinates import Galactic, SkyCoord


def convert_coordinates(df):
    out = pd.DataFrame()
    out["phase"] = df["phase"]
    out["d"] = df["d"]
    lb = zip(df["l"], df["b"])
    coords = [SkyCoord(l=l*u.deg, b=b*u.deg, frame=Galactic) for l, b in lb]
    ras = []
    decs = []
    for coord in coords:
        ras.append(coord.icrs.ra.value)
        decs.append(coord.icrs.dec.value)
    out["ra"] = ras
    out["dec"] = decs

    return out


def convert(filepath):
    df = pd.read_csv(filepath)
    new_df = convert_coordinates(df)
    base, ext = splitext(filepath)
    base = base + "_radec"
    path = base + extsep + ext
    new_df.to_csv(path, index=False)


if __name__ == "__main__":
    import sys
    filepath = sys.argv[1]
    convert(filepath)
