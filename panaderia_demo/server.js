/**
 * 💻 SISTEMA DE GESTIÓN LOCAL - PANADERÍA
 * @author Manuel.G.T.P.
 * @co-authors Grupo de Proyecto (Contabilidad)
 * @institution SENA (Servicio Nacional de Aprendizaje)
 * @year 2026
 * @description Servidor central y base de datos local para procesamiento de pedidos.
 * Todos los derechos reservados.
 */

const express = require('express');
const Datastore = require('@seald-io/nedb');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// --- SISTEMA DE CONTROL DE MOROSIDAD AUTOMÁTICO (MANUEL.G.T.P.) ---
const CONFIG_PAGO = {
    claveSecretaManuel: "MANUEL_SENA_2026_PANAD", 
    contrasenaAdmin: "mgtp870989",                
    fechaVencimiento: new Date("2026-07-26T23:59:59"), 
    ultimaFechaEncendido: new Date(),             
    bloqueoManualBruto: false                     
};

function generarCodigoHabilitacion() {
    let hash = 0;
    const cadena = CONFIG_PAGO.fechaVencimiento.toDateString() + CONFIG_PAGO.claveSecretaManuel;
    for (let i = 0; i < cadena.length; i++) {
        hash = cadena.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash % 90000 + 10000).toString();
}

function obtenerEstadoServicio() {
    if (CONFIG_PAGO.bloqueoManualBruto === true) {
        return "suspendido";
    }

    const ahora = new Date();
    
    if ((CONFIG_PAGO.ultimaFechaEncendido - ahora) > 10000) {
        return "suspendido"; 
    }

    if (ahora > CONFIG_PAGO.ultimaFechaEncendido) {
        CONFIG_PAGO.ultimaFechaEncendido = ahora;
    }

    const diferenciaTiempo = ahora - CONFIG_PAGO.fechaVencimiento;
    const diasDeMora = Math.floor(diferenciaTiempo / (1000 * 60 * 60 * 24));

    if (diasDeMora >= 2) {
        return "suspendido";   
    } else if (diasDeMora >= 1) {
        return "advertencia";  
    }
    return "activo";           
}

function verificarBloqueoServicio(req, res, next) {
    if (obtenerEstadoServicio() === "suspendido") {
        return res.status(402).json({ error: "Servicio suspendido. Registro o cambios deshabilitados por morosidad." });
    }
    next();
}

const dirUploads = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(dirUploads)){
    fs.mkdirSync(dirUploads, { recursive: true });
}
app.use('/uploads', express.static(dirUploads));

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, dirUploads);
    },
    filename: (req, file, cb) => {
        const extension = path.extname(file.originalname);
        const nombreUnico = Date.now() + '-' + Math.round(Math.random() * 1E9) + extension;
        cb(null, nombreUnico);
    }
});
const upload = multer({ storage: storage });

// BASES DE DATOS LOCALES
const dbPedidos = new Datastore({ filename: path.join(__dirname, 'pedidos.db'), autoload: true });
const dbCierres = new Datastore({ filename: path.join(__dirname, 'cierres.db'), autoload: true });
const dbProductos = new Datastore({ filename: path.join(__dirname, 'productos.db'), autoload: true });
const dbComisiones = new Datastore({ filename: path.join(__dirname, 'comisiones.db'), autoload: true });


// === ENDPOINTS DE MOROSIDAD Y COMISIONES ===

app.get('/api/estado-servicio', (req, res) => {
    res.json({ estado: obtenerEstadoServicio() });
});

// Función interna reutilizable para procesar el desbloqueo
function procesarDesbloqueoPorCodigo(codigo, res) {
    const codigoCorrecto = generarCodigoHabilitacion();

    if (codigo === codigoCorrecto) {
        CONFIG_PAGO.bloqueoManualBruto = false;
        CONFIG_PAGO.fechaVencimiento.setDate(CONFIG_PAGO.fechaVencimiento.getDate() + 7);
        
        // Al desbloquear por código semanal, reiniciamos la comisión a cero
        dbComisiones.update(
            { tipo: 'cuenta_semanal' },
            { $set: { acumuladoComision: 0, totalVentasSemana: 0 } },
            { upsert: true }
        );

        return res.json({ exito: true, mensaje: "Sistema reactivado y comisiones liquidadas con éxito por una semana." });
    }
    return res.status(400).json({ exito: false, mensaje: "Código de habilitación incorrecto." });
}

app.post('/api/desbloquear-codigo', (req, res) => {
    procesarDesbloqueoPorCodigo(req.body.codigo, res);
});

// Alias compatible con el frontend de dueno.html
app.post('/api/estado-servicio/reactivar', (req, res) => {
    procesarDesbloqueoPorCodigo(req.body.codigo, res);
});

app.post('/api/manuel-panel', (req, res) => {
    const { contrasena } = req.body;
    if (contrasena === CONFIG_PAGO.contrasenaAdmin) {
        dbComisiones.findOne({ tipo: 'cuenta_semanal' }, (err, cuenta) => {
            return res.json({
                exito: true,
                estadoActual: obtenerEstadoServicio(),
                bloqueoManual: CONFIG_PAGO.bloqueoManualBruto,
                proximoVencimiento: CONFIG_PAGO.fechaVencimiento.toISOString().split('T')[0],
                codigoHabilitacion: generarCodigoHabilitacion(),
                acumuladoComision: cuenta ? cuenta.acumuladoComision : 0,
                totalVentasSemana: cuenta ? cuenta.totalVentasSemana : 0
            });
        });
    } else {
        res.status(401).json({ exito: false, mensaje: "Contraseña de administrador incorrecta." });
    }
});

app.post('/api/manuel-confirmar-pago', (req, res) => {
    const { contrasena, accion } = req.body;
    if (contrasena === CONFIG_PAGO.contrasenaAdmin) {
        
        if (accion === "BLOQUEAR_EMERGENCIA") {
            CONFIG_PAGO.bloqueoManualBruto = true;
            return res.json({ exito: true, mensaje: "Bloqueo bruto de emergencia activado instantáneamente." });
        }
        
        if (accion === "DESBLOQUEAR_MANUAL") {
            CONFIG_PAGO.bloqueoManualBruto = false;
            return res.json({ exito: true, mensaje: "Bloqueo bruto removido manualmente." });
        }

        // CONFIRMAR PAGO: Extiende fecha y reinicia saldo acumulado de comisión
        CONFIG_PAGO.bloqueoManualBruto = false; 
        CONFIG_PAGO.fechaVencimiento.setDate(CONFIG_PAGO.fechaVencimiento.getDate() + 7);

        dbComisiones.update(
            { tipo: 'cuenta_semanal' },
            { $set: { acumuladoComision: 0, totalVentasSemana: 0 } },
            { upsert: true },
            (err) => {
                if (err) return res.status(500).json({ exito: false, mensaje: "Error al reiniciar saldo." });
                res.json({ exito: true, mensaje: "Pago registrado, saldo reiniciado a $0 y fecha extendida una semana." });
            }
        );
    } else {
        res.status(401).json({ exito: false, mensaje: "Acceso denegado." });
    }
});


// === RUTAS DE PRODUCTOS ===
app.get('/api/productos', (req, res) => {
    dbProductos.find({}).sort({ nombre: 1 }).exec((err, docs) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(docs);
    });
});

app.post('/api/productos', verificarBloqueoServicio, upload.single('foto'), (req, res) => {
    const { nombre, precio } = req.body;
    if (!nombre || !precio) return res.status(400).json({ error: 'Datos incompletos' });
    
    const urlImagen = req.file 
        ? `/uploads/${req.file.filename}` 
        : 'https://images.unsplash.com/photo-1549931319-a545dcf3bc73?w=500&q=80';

    dbProductos.insert({ nombre, precio: Number(precio), imagen: urlImagen }, (err, doc) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ mensaje: 'Producto agregado con éxito', producto: doc });
    });
});

app.delete('/api/productos/:id', verificarBloqueoServicio, (req, res) => {
    dbProductos.findOne({ _id: req.params.id }, (err, prod) => {
        if (prod && prod.imagen && prod.imagen.startsWith('/uploads/')) {
            const rutaArchivo = path.join(__dirname, 'public', prod.imagen);
            if (fs.existsSync(rutaArchivo)) {
                fs.unlinkSync(rutaArchivo);
            }
        }
        dbProductos.remove({ _id: req.params.id }, {}, (errRemov) => {
            if (errRemov) return res.status(500).json({ error: errRemov.message });
            res.json({ mensaje: 'Producto e imagen eliminados con éxito' });
        });
    });
});

// === RUTAS DE PEDIDOS Y COMISIONES ===
app.post('/api/pedidos', verificarBloqueoServicio, (req, res) => {
    const { items, total, cliente } = req.body;
    const nuevoPedido = {
        items: items || [],
        total: Number(total) || 0,
        cliente: cliente || null,
        estado: 'Pendiente',
        fecha: new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })
    };
    dbPedidos.insert(nuevoPedido, (err, doc) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ mensaje: 'Pedido registrado con éxito', pedido: doc });
    });
});

app.get('/api/pedidos', (req, res) => {
    dbPedidos.find({}).sort({ fecha: -1 }).exec((err, docs) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(docs);
    });
});

app.put('/api/pedidos/:id', verificarBloqueoServicio, (req, res) => {
    const id = req.params.id;
    const nuevoEstado = req.body.estado;

    dbPedidos.findOne({ _id: id }, (err, pedido) => {
        if (err || !pedido) return res.status(404).json({ error: "Pedido no encontrado" });

        const yaEstabaEntregado = pedido.estado === 'Entregado';

        dbPedidos.update({ _id: id }, { $set: { estado: nuevoEstado } }, {}, (errUp) => {
            if (errUp) return res.status(500).json({ error: errUp.message });

            if (nuevoEstado === 'Entregado' && !yaEstabaEntregado) {
                const comisionPedido = (Number(pedido.total) || 0) * 0.009;

                dbComisiones.findOne({ tipo: 'cuenta_semanal' }, (errCom, cuenta) => {
                    if (!cuenta) {
                        dbComisiones.insert({ tipo: 'cuenta_semanal', acumuladoComision: comisionPedido, totalVentasSemana: Number(pedido.total) || 0 });
                    } else {
                        dbComisiones.update(
                            { tipo: 'cuenta_semanal' },
                            { 
                                $inc: { 
                                    acumuladoComision: comisionPedido,
                                    totalVentasSemana: Number(pedido.total) || 0 
                                } 
                            },
                            {}
                        );
                    }
                });
            }

            res.json({ success: true, mensaje: "Estado actualizado con éxito" });
        });
    });
});

app.delete('/api/pedidos/limpiar', verificarBloqueoServicio, (req, res) => {
    dbPedidos.remove({}, { multi: true }, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ mensaje: `Pantalla limpia.` });
    });
});

// === RUTAS DE CIERRES ===
app.post('/api/cierres/procesar', verificarBloqueoServicio, (req, res) => {
    dbPedidos.find({}, (err, pedidos) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!pedidos || pedidos.length === 0) return res.status(400).json({ error: 'No hay pedidos hoy para cerrar.' });

        const pedidosEntregados = pedidos.filter(p => p.estado === 'Entregado');

        if (pedidosEntregados.length === 0) {
            return dbPedidos.remove({}, { multi: true }, (errLimpieza) => {
                if (errLimpieza) return res.status(500).json({ error: errLimpieza.message });
                res.json({ exito: true, mensaje: 'Cierre completado. No se registraron ventas porque ningún pedido fue entregado. Pantalla limpia.' });
            });
        }

        const totalDinero = pedidosEntregados.reduce((sum, p) => sum + (Number(p.total) || 0), 0);
        const conteoProductos = {};

        pedidosEntregados.forEach(p => {
            if (Array.isArray(p.items)) {
                p.items.forEach(item => {
                    let nombreLimpio = "Producto Indefinido";
                    
                    if (typeof item === 'string') {
                        nombreLimpio = item.split(' (')[0].split(' - ')[0].trim();
                    } else if (item && typeof item === 'object' && item.nombre) {
                        nombreLimpio = item.nombre.trim();
                    }
                    
                    conteoProductos[nombreLimpio] = (conteoProductos[nombreLimpio] || 0) + 1;
                });
            }
        });

        const nuevoCierre = {
            fechaCierre: new Date().toLocaleDateString('es-CO', { timeZone: 'America/Bogota' }),
            horaCierre: new Date().toLocaleTimeString('es-CO', { timeZone: 'America/Bogota' }),
            totalVentas: totalDinero,
            totalPedidos: pedidosEntregados.length,
            productosVendidos: conteoProductos
        };

        dbCierres.insert(nuevoCierre, (errCierre) => {
            if (errCierre) return res.status(500).json({ error: errCierre.message });
            
            dbPedidos.remove({}, { multi: true }, (errLimpieza) => {
                if (errLimpieza) return res.status(500).json({ error: errLimpieza.message });
                res.json({ exito: true, mensaje: 'Cierre de caja guardado con éxito. Se descartaron pedidos no atendidos y la pantalla quedó limpia.' });
            });
        });
    });
});

app.get('/api/cierres', (req, res) => {
    dbCierres.find({}).sort({ fechaCierre: -1 }).exec((err, docs) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(docs);
    });
});

app.delete('/api/cierres/:id', verificarBloqueoServicio, (req, res) => {
    dbCierres.remove({ _id: req.params.id }, {}, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ exito: true, mensaje: "Registro de cierre eliminado del historial." });
    });
});

app.get('/api/comisiones/semanal', (req, res) => {
    dbComisiones.findOne({ tipo: 'cuenta_semanal' }, (err, cuenta) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({
            acumuladoComision: cuenta ? cuenta.acumuladoComision : 0,
            totalVentasSemana: cuenta ? cuenta.totalVentasSemana : 0
        });
    });
});

app.get('/autor', (req, res) => {
    res.json({
        proyecto: "Panadería El Buen Pan",
        desarrollador_principal: "Manuel.G.T.P.",
        entidad: "SENA 2026",
        licencia: "Privada - Propiedad Intelectual de los Creadores"
    });
});

const PORT = 8080;
app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));
