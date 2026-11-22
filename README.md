# E-commerce Store

A simple e-commerce store: product listings, product details, shopping cart and order processing.

- **Backend:** Django + Django REST Framework (`backend/`)
- **Frontend:** HTML, CSS, JavaScript, no framework (`frontend/`)

## Project layout

| Folder | What lives there |
|---|---|
| `backend/config/` | Django settings (`base`, `dev`, `prod`) and main URL routing |
| `backend/apps/products/` | Product catalog: models, API, admin, sample data |
| `backend/apps/pages/` | Serves the frontend HTML pages |
| `frontend/pages/` | One HTML file per page |
| `frontend/css/` | Design tokens, shared styles, per-page styles |
| `frontend/js/` | `api/` (server calls), `components/`, `pages/`, `animations/`, `utils/` |

## Run locally (Windows)

    cd backend
    py -m venv .venv
    .venv\Scripts\Activate.ps1
    pip install -r requirements.txt
    copy .env.example .env
    python manage.py migrate
    python manage.py createsuperuser
    python manage.py seed_products
    python manage.py runserver

Open http://127.0.0.1:8000