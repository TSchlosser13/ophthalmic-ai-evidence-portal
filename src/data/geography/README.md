# Map geography

`world-countries.json` contains Natural Earth 1:110m administrative country geometry,
version 5.1.1, with the ADM0_A3 identifiers and label coordinates retained.
Hong Kong, Singapore and French Polynesia use label coordinates from the same
version's 1:50m administrative country layer. These locations let small territories
remain selectable at the world scale.

Natural Earth is public-domain map data:
https://www.naturalearthdata.com/about/terms-of-use/

Pinned upstream source:
https://github.com/nvkelso/natural-earth-vector/tree/ca96624a56bd078437bca8184e78163e5039ad19/geojson

`country-locations.json` maps the portal's affiliation-country names to map
identifiers and label positions. Publication memberships are stored in `countries`
in `src/data/generated/articles.json`. The site build runs
`scripts/sync_collaboration.py` to derive country totals, exact co-authorship
pairs, publication links, and CSV downloads. Countries count each publication
once; pairs count each shared publication once. Astro generates the SVG map
from those same data using NaturalEarth1 and Viridis.
