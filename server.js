const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
require("dotenv").config();

const app = express();

const allowedOrigins = ["http://localhost:3000", "http://localhost:3001", "https://skintopia.com.mx"];

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

// 🔌 Configuración de la base de datos con promesas
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 60000,
});

(async () => {
    try {
        const connection = await db.getConnection();
        console.log("✅ Conectado a la base de datos MySQL");
        connection.release();
    } catch (err) {
        console.error("❌ Error conectando a la base de datos:", err);
    }
})();

app.get("/api/comments/:blog_id", async (req, res) => {
    const { blog_id } = req.params;

    try {
        // Obtener comentarios principales del blog (ya aprobados)
        const queryComentarios = `SELECT * FROM comentarios WHERE blog_id = ? AND estado = 1 ORDER BY fecha_creacion ASC`;
        const [comentarios] = await db.query(queryComentarios, [blog_id]);

        // Obtener respuestas asociadas a esos comentarios
        const comentarioIds = comentarios.map(c => c.id);

        let respuestas = [];
        if (comentarioIds.length > 0) {
            const queryRespuestas = `SELECT * FROM respuestas WHERE comentario_id IN (${comentarioIds.map(() => "?").join(",")}) ORDER BY fecha_creacion ASC`;
            [respuestas] = await db.query(queryRespuestas, comentarioIds);
        }

        // Asociar respuestas a sus comentarios correspondientes
        const comentariosMap = comentarios.map(c => ({
            ...c,
            respuestas: respuestas.filter(r => r.comentario_id === c.id),
        }));

        res.json(comentariosMap);
    } catch (err) {
        console.error("Error al obtener comentarios:", err);
        res.status(500).json({ error: err.message });
    }
});



// 📌 Ruta para agregar un nuevo comentario (estado = 0 por defecto)
app.post("/api/comments", async (req, res) => {
    const { blog_id, parent_id, autor, email, comentario } = req.body;

    if (!blog_id || !autor || !email || !comentario) {
        return res.status(400).json({ error: "Todos los campos son obligatorios" });
    }

    const query = `
        INSERT INTO comentarios (blog_id, parent_id, autor, email, comentario, estado, fecha_creacion)
        VALUES (?, ?, ?, ?, ?, 0, NOW())`;

    try {
        const [result] = await db.query(query, [blog_id, parent_id || null, autor, email, comentario]);
        res.json({ message: "Comentario agregado con éxito, pendiente de aprobación", id: result.insertId });
    } catch (err) {
        console.error("Error al agregar comentario:", err);
        res.status(500).json({ error: err.message });
    }
});

// 📌 Ruta para obtener todos los comentarios y sus respuestas con el título del blog
app.get("/api/admin/comments", async (req, res) => {
    try {
        // Obtener los comentarios con el título del blog
        const [comments] = await db.query(`
            SELECT comentarios.*, blogs.titulo AS blog_titulo 
            FROM comentarios
            LEFT JOIN blogs ON comentarios.blog_id = blogs.id
            ORDER BY comentarios.fecha_creacion DESC
        `);

        // Obtener todas las respuestas
        const [respuestas] = await db.query("SELECT * FROM respuestas");

        // Agregar las respuestas a sus comentarios correspondientes
        const comentariosConRespuestas = comments.map(comment => ({
            ...comment,
            respuestas: respuestas.filter(r => r.comentario_id === comment.id) || [], // Siempre un array
        }));

        res.json(comentariosConRespuestas);
    } catch (error) {
        console.error("Error al obtener los comentarios:", error);
        res.status(500).json({ error: "Error en el servidor" });
    }
});


// 📌 Ruta para actualizar el estado de un comentario
app.post("/api/admin/comments/toggle-status", async (req, res) => {
    const { id } = req.body; // Recibimos el ID en el cuerpo de la solicitud

    if (!id) {
        return res.status(400).json({ error: "ID del comentario es requerido" });
    }

    try {
        // Obtener el estado actual del comentario
        const [rows] = await db.execute("SELECT estado FROM comentarios WHERE id = ?", [id]);

        if (rows.length === 0) {
            return res.status(404).json({ error: "Comentario no encontrado" });
        }

        const nuevoEstado = rows[0].estado === 1 ? 0 : 1;

        // Actualizar el estado en la base de datos
        await db.execute("UPDATE comentarios SET estado = ? WHERE id = ?", [nuevoEstado, id]);

        res.json({ message: "Estado actualizado con éxito", nuevoEstado });
    } catch (error) {
        console.error("Error al actualizar estado:", error);
        res.status(500).json({ error: "Error en el servidor" });
    }
});

// Ruta para guardar una respuesta
app.post("/api/admin/responses", async (req, res) => {
    try {
        const { comentario_id, respuesta, autor } = req.body;

        if (!comentario_id || !respuesta || !autor) {
            return res.status(400).json({ message: "Todos los campos son requeridos" });
        }

        // Insertar en la tabla respuestas
        const sql = "INSERT INTO respuestas (comentario_id, respuesta, autor, fecha_creacion) VALUES (?, ?, ?, NOW())";
        await db.query(sql, [comentario_id, respuesta, autor]);

        res.status(201).json({ message: "Respuesta guardada correctamente" });
    } catch (error) {
        console.error("Error al guardar la respuesta:", error);
        res.status(500).json({ message: "Error interno del servidor" });
    }
});

// 📌 Ruta para actualizar un comentario
app.put("/api/admin/comments/:id", async (req, res) => {
    const { id } = req.params;
    const { comentario } = req.body;

    if (!comentario) {
        return res.status(400).json({ error: "El comentario no puede estar vacío" });
    }

    try {
        await db.execute("UPDATE comentarios SET comentario = ? WHERE id = ?", [comentario, id]);
        res.json({ message: "Comentario actualizado correctamente" });
    } catch (error) {
        console.error("Error al actualizar el comentario:", error);
        res.status(500).json({ error: "Error en el servidor" });
    }
});

// 📌 Ruta para eliminar una respuesta
app.delete("/api/admin/responses/:id", async (req, res) => {
    const { id } = req.params;

    try {
        await db.execute("DELETE FROM respuestas WHERE id = ?", [id]);
        res.json({ message: "Respuesta eliminada correctamente" });
    } catch (error) {
        console.error("Error al eliminar la respuesta:", error);
        res.status(500).json({ error: "Error en el servidor" });
    }
});

// 📌 Ruta para eliminar un comentario (y sus respuestas asociadas)
app.delete("/api/admin/comments/:id", async (req, res) => {
    const { id } = req.params;

    try {
        // Primero eliminamos las respuestas asociadas
        await db.execute("DELETE FROM respuestas WHERE comentario_id = ?", [id]);

        // Luego eliminamos el comentario
        const [result] = await db.execute("DELETE FROM comentarios WHERE id = ?", [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "El comentario no existe" });
        }

        res.json({ message: "Comentario eliminado correctamente" });
    } catch (error) {
        console.error("Error al eliminar el comentario:", error);
        res.status(500).json({ error: "Error en el servidor" });
    }
});





const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});