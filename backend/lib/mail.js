'use strict';

const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (!transporter) {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host) throw new Error('SMTP_HOST is not configured');

    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
    });
  }
  return transporter;
}

function getFromAddress() {
  return process.env.SMTP_FROM || `Solmira <${process.env.SMTP_USER || 'no-reply@solmira.in'}>`;
}

async function sendOtpEmail(to, otp) {
  const transport = getTransporter();
  await transport.sendMail({
    from: getFromAddress(),
    to,
    subject: `${otp} is your Solmira password reset code`,
    text: `Your Solmira password reset code is ${otp}. It expires in 10 minutes. If you did not request this, you can safely ignore this email.`,
    html: `
      <div style="font-family:'DM Sans',Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#FAF8F4;border-radius:12px;">
        <div style="text-align:center;margin-bottom:24px;">
          <span style="font-size:22px;font-weight:700;color:#1C1410;">Sol<span style="color:#2D6A4F;">mira</span></span>
        </div>
        <div style="background:#ffffff;border:1px solid rgba(28,20,16,0.08);border-radius:10px;padding:28px;text-align:center;">
          <p style="margin:0 0 8px;font-size:15px;color:#4A3F38;">Use this code to reset your password</p>
          <p style="margin:0 0 16px;font-size:34px;font-weight:700;letter-spacing:8px;color:#1C1410;">${otp}</p>
          <p style="margin:0;font-size:13px;color:#9CA3A0;">This code expires in 10 minutes.</p>
        </div>
        <p style="text-align:center;font-size:12px;color:#9CA3A0;margin-top:20px;">
          If you didn't request a password reset, you can safely ignore this email.
        </p>
      </div>
    `,
  });
}

async function sendRegistrationOtpEmail(to, otp) {
  const transport = getTransporter();
  await transport.sendMail({
    from: getFromAddress(),
    to,
    subject: otp + ' is your Solmira verification code',
    text: 'Your Solmira verification code is ' + otp + '. It expires in 10 minutes. If you did not request this, you can safely ignore this email.',
    html:
      '<div style="font-family:\'DM Sans\',Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#FAF8F4;border-radius:12px;">' +
      '<div style="text-align:center;margin-bottom:24px;">' +
      '<span style="font-size:22px;font-weight:700;color:#1C1410;">Sol<span style="color:#2D6A4F;">mira</span></span>' +
      '</div>' +
      '<div style="background:#ffffff;border:1px solid rgba(28,20,16,0.08);border-radius:10px;padding:28px;text-align:center;">' +
      '<p style="margin:0 0 8px;font-size:15px;color:#4A3F38;">Use this code to verify your email</p>' +
      '<p style="margin:0 0 16px;font-size:34px;font-weight:700;letter-spacing:8px;color:#1C1410;">' + otp + '</p>' +
      '<p style="margin:0;font-size:13px;color:#9CA3A0;">This code expires in 10 minutes.</p>' +
      '</div>' +
      '<p style="text-align:center;font-size:12px;color:#9CA3A0;margin-top:20px;">' +
      'If you didn\'t request this code, you can safely ignore this email.' +
      '</p></div>',
  });
}

module.exports = {
  getTransporter,
  getFromAddress,
  sendOtpEmail,
  sendRegistrationOtpEmail,
};
