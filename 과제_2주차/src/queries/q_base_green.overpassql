[out:json][timeout:300][bbox:37.5267,126.9199,37.6203,127.0377];
(
  way["leisure"~"^(park|garden)$"];
  relation["leisure"="park"];
  way["landuse"~"^(forest|grass|recreation_ground|cemetery)$"];
  relation["landuse"="forest"];
  way["natural"~"^(wood|scrub)$"];
  relation["natural"="wood"];
);
out tags geom;
