# 📦 Instrucciones para Subir a Git

## ✅ Ya hecho:
- [x] Git inicializado
- [x] .gitignore configurado
- [x] Commit inicial creado

## 🚀 Próximos pasos:

### Opción 1: GitHub (Recomendado)

1. **Crear repositorio en GitHub:**
   - Ve a https://github.com/new
   - Nombre: `erplozada` (o el que prefieras)
   - **NO** inicialices con README, .gitignore o licencia (ya los tenemos)
   - Click en "Create repository"

2. **Conectar y subir:**
   ```bash
   cd /Users/tomiisanchezz/Desktop/Repos/erplozada
   
   # Reemplaza TU_USUARIO con tu usuario de GitHub
   git remote add origin https://github.com/TU_USUARIO/erplozada.git
   
   # O si prefieres SSH:
   # git remote add origin git@github.com:TU_USUARIO/erplozada.git
   
   git branch -M main
   git push -u origin main
   ```

### Opción 2: GitLab

1. **Crear repositorio en GitLab:**
   - Ve a https://gitlab.com/projects/new
   - Crea un nuevo proyecto vacío

2. **Conectar y subir:**
   ```bash
   cd /Users/tomiisanchezz/Desktop/Repos/erplozada
   git remote add origin https://gitlab.com/TU_USUARIO/erplozada.git
   git branch -M main
   git push -u origin main
   ```

### Opción 3: Bitbucket

Similar a los anteriores, solo cambia la URL.

---

## 🔗 Después de subir a Git:

### Si usas Vercel:

1. **Conectar repositorio:**
   - Ve a https://vercel.com/new
   - Importa el proyecto desde GitHub/GitLab
   - Vercel detectará automáticamente que es Next.js

2. **Configurar variables de entorno:**
   - En el dashboard de Vercel → Settings → Environment Variables
   - Agregar:
     - `NEXT_PUBLIC_SUPABASE_URL`
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
     - `SUPABASE_SERVICE_ROLE_KEY`

3. **Deploy automático:**
   - Vercel desplegará automáticamente
   - Cada push a `main` hará un nuevo deploy

---

## 📝 Comandos útiles:

```bash
# Ver estado
git status

# Ver commits
git log --oneline

# Agregar cambios futuros
git add .
git commit -m "descripción del cambio"
git push

# Ver remoto configurado
git remote -v
```

---

## ⚠️ Importante:

**NO subas estos archivos:**
- `.env.local` (ya está en .gitignore)
- `node_modules/` (ya está en .gitignore)
- `.next/` (ya está en .gitignore)
- Backups (ya están en .gitignore)

Todo está configurado correctamente en el `.gitignore`.

---

## 🎯 Siguiente paso:

1. Crea el repositorio en GitHub/GitLab
2. Ejecuta los comandos de conexión
3. Haz `git push`
4. Conecta con Vercel (si usas Vercel)
5. ¡A producción! 🚀

