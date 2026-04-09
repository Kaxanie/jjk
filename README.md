# JJK: Echoes of Cursed Dawn — Playable Demo

This repository contains a browser-playable prototype inspired by the provided game design draft:

- Top-down exploration on a tile map
- Mission board interaction and progression objective flow
- Bell Seal collection gate
- Turn-based combat with CE costs, affinities, and a Domain Expansion unlock
- Boss encounter that promotes Exorcism Rank from F to E on clear

## Run locally

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000> in a browser.

## Controls

- `WASD` / Arrow keys: move
- `M`: interact (mission board / gate / seals)
- `B`: trigger tutorial battle
- `R`: restart demo
