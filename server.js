const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
require("dotenv").config();

const app = express();

const allowedOrigins = ["http://localhost:3000", "http://localhost:3001", "http://tudominio.com"];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error("No permitido por CORS"));
        }
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));


app.use(express.json());

// Conexión a la base de datos MySQL
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
});

db.connect((err) => {
    if (err) {
        console.error("❌ Error conectando a la base de datos:", err);
        return;
    }
    console.log("✅ Conectado a la base de datos MySQL");
});

// 📌 Ruta para obtener comentarios por blog_id (solo los aprobados)
app.get("/api/comments/:blog_id", (req, res) => {
    const { blog_id } = req.params;
    const query = `SELECT * FROM comentarios WHERE blog_id = ? AND estado = 1 ORDER BY fecha_creacion ASC`;
    
    db.query(query, [blog_id], (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(results);
    });
});

// 📌 Ruta para agregar un nuevo comentario (estado = 0 por defecto)
app.post("/api/comments", (req, res) => {
    const { blog_id, parent_id, autor, email, comentario } = req.body;
    
    if (!blog_id || !autor || !email || !comentario) {
        return res.status(400).json({ error: "Todos los campos son obligatorios" });
    }

    const query = `
        INSERT INTO comentarios (blog_id, parent_id, autor, email, comentario, estado, fecha_creacion)
        VALUES (?, ?, ?, ?, ?, 0, NOW())`; // 👈 Se agregó la columna estado con valor 0

    db.query(query, [blog_id, parent_id || null, autor, email, comentario], (err, result) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ message: "Comentario agregado con éxito, pendiente de aprobación", id: result.insertId });
    });
});

app.get("/api/admin/comments", (req, res) => {
    const query = `
        SELECT c.id, c.blog_id, c.autor, c.email, c.comentario, c.estado, c.fecha_creacion, 
                b.titulo AS blog_titulo
        FROM comentarios c
        LEFT JOIN blogs b ON c.blog_id = b.id
        ORDER BY c.fecha_creacion DESC
    `;

    db.query(query, (err, results) => {
        if (err) {
            return res.status(500).json({ error: "Error al obtener los comentarios" });
        }
        res.json(results);
    });
});



const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});