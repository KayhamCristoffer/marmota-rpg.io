const express = require('express');
const router  = express.Router();
const { isAuth } = require('../middleware/auth');
const multer  = require('multer');
const fetch   = require('node-fetch');
const path    = require('path');
const fs      = require('fs');

// Armazenamento temporário local antes de subir ao GitHub
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tmp = path.join(__dirname, '../../public/uploads/tmp');
    fs.mkdirSync(tmp, { recursive: true });
    cb(null, tmp);
  },
  filename: (req, file, cb) => {
    cb(null, `${req.uid}-${Date.now()}${path.extname(file.originalname)}`);
  }
});

const fileFilter = (req, file, cb) => {
  if (/jpeg|jpg|png|gif|webp/.test(file.mimetype)) cb(null, true);
  else cb(new Error('Apenas imagens permitidas'));
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

// ─── POST /api/upload/quest ─────────────────────────────────────
// Faz upload da imagem para o GitHub: users/{uid}/{questId}.png
router.post('/quest', isAuth, upload.single('print'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada' });

  const { questId } = req.body;
  if (!questId) return res.status(400).json({ error: 'questId é obrigatório' });

  const uid      = req.uid;
  const ext      = path.extname(req.file.originalname).toLowerCase() || '.png';
  const filePath = `users/${uid}/${questId}${ext}`;          // caminho no repo
  const fileData = fs.readFileSync(req.file.path);
  const base64   = fileData.toString('base64');

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const GITHUB_REPO  = process.env.GITHUB_REPO;   // ex: KayhamCristoffer/rpg-marmota
  const GITHUB_BRANCH= process.env.GITHUB_BRANCH || 'main';

  try {
    // Verificar se já existe (para pegar SHA e fazer update)
    let sha = null;
    const checkRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}`,
      { headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' } }
    );
    if (checkRes.ok) {
      const existing = await checkRes.json();
      sha = existing.sha;
    }

    // Upload para GitHub
    const body = {
      message: `upload: quest proof ${uid}/${questId}`,
      content: base64,
      branch:  GITHUB_BRANCH
    };
    if (sha) body.sha = sha;

    const uploadRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      }
    );

    const uploadData = await uploadRes.json();

    // Limpar arquivo temporário
    fs.unlinkSync(req.file.path);

    if (!uploadRes.ok) {
      console.error('GitHub upload error:', uploadData);
      return res.status(500).json({ error: 'Falha ao salvar imagem no GitHub', detail: uploadData.message });
    }

    // URL raw do GitHub
    const rawUrl = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/${filePath}`;

    res.json({
      success:   true,
      url:       rawUrl,
      path:      filePath,
      githubUrl: uploadData.content?.html_url
    });
  } catch (err) {
    // Limpar arquivo temporário em caso de erro
    try { fs.unlinkSync(req.file.path); } catch (_) {}
    console.error('upload/quest error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
