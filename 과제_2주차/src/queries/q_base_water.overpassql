[out:json][timeout:300][bbox:37.5267,126.9199,37.6203,127.0377];
(
  way["railway"~"^(rail|light_rail)$"];
  way["waterway"~"^(river|stream|canal)$"];
  way["natural"="water"];
  relation["natural"="water"];
);
out tags geom;
