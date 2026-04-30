require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// 创建邮件传输器
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// 存储验证码（生产环境应使用数据库）
const verificationCodes = {};

// 发送验证码
app.post('/api/send-verification-code', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ success: false, message: '请输入邮箱' });
    }
    
    // 生成6位验证码
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // 保存验证码（有效期5分钟）
    verificationCodes[email] = {
      code,
      expiresAt: Date.now() + 5 * 60 * 1000
    };
    
    // 发送邮件
    const mailOptions = {
      from: `AI助手 <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'AI助手 - 找回密码验证码',
      text: `您的验证码是：${code}\n\n此验证码有效期为5分钟，请尽快使用。`
    };
    
    await transporter.sendMail(mailOptions);
    
    console.log(`验证码 ${code} 已发送到 ${email}`);
    
    res.json({ success: true, message: '验证码已发送到您的邮箱' });
  } catch (error) {
    console.error('发送邮件失败:', error);
    res.status(500).json({ success: false, message: '发送邮件失败，请稍后重试' });
  }
});

// 验证验证码
app.post('/api/verify-code', (req, res) => {
  try {
    const { email, code } = req.body;
    
    if (!email || !code) {
      return res.status(400).json({ success: false, message: '请输入邮箱和验证码' });
    }
    
    const savedCode = verificationCodes[email];
    
    if (!savedCode) {
      return res.status(400).json({ success: false, message: '请先获取验证码' });
    }
    
    if (Date.now() > savedCode.expiresAt) {
      delete verificationCodes[email];
      return res.status(400).json({ success: false, message: '验证码已过期，请重新获取' });
    }
    
    if (savedCode.code !== code) {
      return res.status(400).json({ success: false, message: '验证码错误' });
    }
    
    res.json({ success: true, message: '验证成功' });
  } catch (error) {
    console.error('验证失败:', error);
    res.status(500).json({ success: false, message: '验证失败' });
  }
});

// 重置密码（前端处理密码更新）
app.post('/api/reset-password', (req, res) => {
  try {
    const { email, code } = req.body;
    
    if (!email || !code) {
      return res.status(400).json({ success: false, message: '请输入邮箱和验证码' });
    }
    
    const savedCode = verificationCodes[email];
    
    if (!savedCode) {
      return res.status(400).json({ success: false, message: '请先获取验证码' });
    }
    
    if (Date.now() > savedCode.expiresAt) {
      delete verificationCodes[email];
      return res.status(400).json({ success: false, message: '验证码已过期，请重新获取' });
    }
    
    if (savedCode.code !== code) {
      return res.status(400).json({ success: false, message: '验证码错误' });
    }
    
    // 清除验证码
    delete verificationCodes[email];
    
    res.json({ success: true, message: '验证成功，可以重置密码' });
  } catch (error) {
    console.error('重置密码失败:', error);
    res.status(500).json({ success: false, message: '重置密码失败' });
  }
});

app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});