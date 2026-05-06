require('dotenv').config({ path: './server/.env' });
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const hasSmtpConfig = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS;

let transporter = null;
if (hasSmtpConfig) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

const verificationCodes = {};

app.post('/api/send-verification-code', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ success: false, message: '请输入邮箱' });
    }
    
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    verificationCodes[email] = {
      code: code,
      expiresAt: Date.now() + 5 * 60 * 1000
    };
    
    if (hasSmtpConfig && transporter) {
      const mailOptions = {
        from: 'AI助手 <' + process.env.SMTP_USER + '>',
        to: email,
        subject: 'AI助手 - 找回密码验证码',
        text: '您的验证码是：' + code + '\n\n此验证码有效期为5分钟，请尽快使用。'
      };
      
      await transporter.sendMail(mailOptions);
      console.log('验证码 ' + code + ' 已发送到 ' + email);
    } else {
      console.log('========================================');
      console.log('开发模式 - 不发送真实邮件');
      console.log('验证码: ' + code);
      console.log('邮箱: ' + email);
      console.log('请使用上面的验证码完成测试');
      console.log('========================================');
    }
    
    const successMessage = hasSmtpConfig 
      ? '验证码已发送到您的邮箱' 
      : '开发模式：验证码已生成（请查看控制台：' + code + '）';
      
    res.json({ success: true, message: successMessage });
  } catch (error) {
    console.error('发送邮件失败:', error);
    res.status(500).json({ success: false, message: '发送邮件失败，请稍后重试' });
  }
});

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
    
    delete verificationCodes[email];
    
    res.json({ success: true, message: '验证成功，可以重置密码' });
  } catch (error) {
    console.error('重置密码失败:', error);
    res.status(500).json({ success: false, message: '重置密码失败' });
  }
});

app.listen(PORT, () => {
  console.log('服务器运行在 http://localhost:' + PORT);
});
