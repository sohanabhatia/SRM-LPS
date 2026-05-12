# Uniearth Automated Drawing

Upload a DXF building plan, auto-generate Lightning Protection System (LPS) down conductors, and visualize everything on an interactive canvas.

---

## Quick Start

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

API runs at `http://localhost:8000`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

UI runs at `http://localhost:5173`

---

## How It Works

1. Upload a `.dxf` file via the sidebar
2. Backend reads LINE entities and builds a convex-hull boundary
3. Down conductors are placed every 10 000 mm along the boundary
4. Canvas renders white lines (DXF), purple dashed boundary, green conductors (LPS)

## Controls

| Action | Input |
|--------|-------|
| Zoom   | Scroll wheel |
| Pan    | Click + drag |
| Reset  | "Reset View" button |
| Toggle boundary | "Boundary" button |

---

## Project Structure

```
uniearth-automated-drawing/
├── backend/
│   ├── main.py          # FastAPI routes
│   ├── processor.py     # ezdxf + shapely logic
│   └── requirements.txt
└── frontend/
    ├── index.html
    ├── vite.config.js
    ├── tailwind.config.js
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── Sidebar.jsx   # Upload + stats panel
        ├── Canvas.jsx    # Interactive canvas renderer
        └── api.js        # Fetch wrappers
```
