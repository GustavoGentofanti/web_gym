# Meu Treino

Aplicativo de musculação com frontend PWA, backend FastAPI, autenticação segura e persistência local via IndexedDB.

## Visão geral

- Frontend: HTML/CSS/JavaScript puro hospedado no GitHub Pages
- Backend: Python + FastAPI + SQLAlchemy + Alembic + PostgreSQL
- Persistência local: IndexedDB + fila de sincronização
- Offline-first: o treino continua funcionando sem internet
- PWA: installável em Android/iPhone

## Estrutura

```text
meu-treino/
├── frontend/
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   ├── api.js
│   ├── auth.js
│   ├── db.js
│   ├── sync.js
│   ├── workout.js
│   ├── routines.js
│   ├── history.js
│   ├── exercises.js
│   ├── charts.js
│   ├── ui.js
│   ├── config.js
│   ├── manifest.json
│   ├── sw.js
│   └── icons/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── models.py
│   │   ├── schemas.py
│   │   ├── security.py
│   │   ├── routes/
│   │   └── __init__.py
│   ├── alembic/
│   ├── alembic.ini
│   ├── requirements.txt
│   ├── .env.example
│   └── tests/
├── .github/
│   └── workflows/
│       └── deploy-frontend.yml
├── .gitignore
├── README.md
└── docker-compose.yml
```

## Requisitos

- Python 3.11+
- PostgreSQL 15+
- Git
- GitHub Pages

## Configuração do backend

1. Crie um banco PostgreSQL.
2. Copie o exemplo de ambiente:

```bash
cd backend
copy .env.example .env
```

3. Ajuste as variáveis:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/meutreino
SECRET_KEY=sua-chave-secreta-forte
CORS_ORIGINS=http://localhost:8000,http://127.0.0.1:8000
ENVIRONMENT=development
ACCESS_TOKEN_EXPIRE_MINUTES=10080
```

4. Instale dependências:

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

5. Rode as migrações:

```bash
alembic upgrade head
```

6. Inicie a API:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

A documentação Swagger fica em:

- http://localhost:8000/docs

## Deploy do backend

Para produção, configure uma plataforma cloud como Render, Railway, Fly.io, Azure App Service ou similar. O comando de produção deve ser:

```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

Configure também:

- DATABASE_URL
- SECRET_KEY
- CORS_ORIGINS
- ENVIRONMENT=production

## Frontend GitHub Pages

1. Ajuste o valor de API_BASE_URL em [frontend/config.js](frontend/config.js).
2. Faça push para a branch principal do GitHub.
3. Ative GitHub Pages.
4. O deploy automático será feito pelo workflow em [.github/workflows/deploy-frontend.yml](.github/workflows/deploy-frontend.yml).

## Como colocar no ar

1. Criar banco PostgreSQL.
2. Configurar variáveis de ambiente.
3. Fazer deploy do FastAPI.
4. Obter a URL da API.
5. Ajustar API_BASE_URL no frontend.
6. Publicar frontend no GitHub Pages.
7. Abrir o link no iPhone ou Android.
8. Instalar como PWA.

## PWA e offline

- O service worker cacheia os assets estáticos.
- A aplicação segue modelo offline-first.
- As alterações locais entram na fila e sincronizam quando a conexão voltar.

## Segurança

- Senhas com hash seguro via passlib + bcrypt.
- Tokens JWT autenticados por header Authorization.
- Isolamento de dados por usuário.
- CORS configurado por variável de ambiente.

## Troubleshooting

- Se a API falhar em iniciar, confira a variável DATABASE_URL.
- Se o GitHub Pages não carregar, verifique os arquivos estáticos e os caminhos relativos.
- Se o frontend não conseguir conectar, ajuste a URL da API em [frontend/config.js](frontend/config.js).

## Observações

Este projeto foi estruturado para seguir arquitetura offline-first, com separação de frontend e backend e compatibilidade com PostgreSQL em produção.
