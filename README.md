# SkillDocs

Visor local de documentación para archivos `SKILL.md`. Convierte tus skills en documentación navegable con búsqueda, syntax highlight y hot-reload.

## Inicio rápido

```bash
npm install
npm start
# → http://localhost:3000
```

Para desarrollo con auto-restart del servidor:
```bash
npm run dev
```

## Estructura de skills

Cada skill es una carpeta con un `SKILL.md` como punto de entrada:

```
skills/
├── mi-skill/
│   ├── SKILL.md          ← punto de entrada (obligatorio)
│   ├── examples/
│   │   └── ejemplo.vb
│   └── patterns/
│       └── patron.md
└── otro-skill/
    └── SKILL.md
```

Los links relativos en el markdown (`[ver ejemplo](examples/foo.vb)`) se renderizan automáticamente como bloques de código embebidos.

## Configuración

Copia `.env.example` a `.env` y ajusta:

```env
PORT=3000
SKILLS_DIR=./skills
```

## Features

- 📖 Render markdown con syntax highlight (VB.NET, SQL, HTML, JS...)
- 🔍 Búsqueda en todos los skills (`Ctrl+K`)
- 📋 Botón de copiar en cada bloque de código
- ⚡ Hot-reload: banner de aviso al editar cualquier archivo
- 🗂️ TOC (tabla de contenidos) automático por skill
- 🔗 URLs con hash para compartir secciones (`#skill-name/section-id`)

## Deploy / GitHub

```bash
git init
git add .
git commit -m "init: skilldocs"
git remote add origin https://github.com/tu-user/skilldocs.git
git push -u origin main
```

> La carpeta `skills/` está en `.gitignore` por defecto si prefieres mantenerla privada.  
> Si quieres versionar los skills, elimina esa línea del `.gitignore`.
