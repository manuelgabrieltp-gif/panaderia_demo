#!/bin/bash

# Guardar la ruta del proyecto
DIR_PROYECTO="$HOME/Escritorio/panaderia_demo"

echo "====================================================="
echo "🍞 INICIANDO SISTEMA LOCAL - PANADERÍA EL BUEN PAN 🍞"
echo "====================================================="

# 1. Matar procesos previos en el puerto 8080 para evitar el error 'EADDRINUSE'
echo "🧹 Limpiando puertos antiguos..."
fuser -k 8080/tcp 2>/dev/null

# 2. Iniciar el servidor backend en segundo plano
echo "🚀 Encendiendo servidor central de Node.js..."
cd "$DIR_PROYECTO"
node server.js &

# 3. Esperar 3 segundos para asegurar que el servidor responda antes de abrir el navegador
sleep 3

# 4. Abrir automáticamente las 3 páginas en tu navegador web (Linux Mint)
echo "🌐 Abriendo paneles del sistema..."
xdg-open "http://localhost:8080/cliente.html" &
xdg-open "http://localhost:8080/dueno.html" &
xdg-open "http://localhost:8080/manuel.html" &

echo "✅ ¡Todo listo! El sistema está operativo."
echo "👉 Deja esta terminal abierta mientras uses la aplicación."
echo "👉 Para apagar el sistema, presiona Ctrl + C en esta ventana."

# Mantener la terminal acoplada al proceso de Node para ver los logs en vivo
wait
