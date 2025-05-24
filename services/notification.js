const nodemailer = require('nodemailer');
const axios = require('axios');

class NotificationService {
    constructor() {
        this.emailTransporter = null;
        this.webhookUrl = process.env.WEBHOOK_URL;
        this.initializeEmail();
    }

    initializeEmail() {
        if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
            this.emailTransporter = nodemailer.createTransporter({
                host: process.env.SMTP_HOST,
                port: process.env.SMTP_PORT || 587,
                secure: false,
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS
                }
            });
        }
    }

    async sendEmail(to, subject, message, severity = 'info') {
        if (!this.emailTransporter) {
            console.log('Email not configured, skipping email notification');
            return;
        }

        try {
            const mailOptions = {
                from: process.env.SMTP_USER,
                to,
                subject: `[${severity.toUpperCase()}] ${subject}`,
                html: `
                    <h2>Mobile Carrier Testing Framework</h2>
                    <p><strong>Severity:</strong> ${severity}</p>
                    <p><strong>Message:</strong> ${message}</p>
                    <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
                `
            };

            await this.emailTransporter.sendMail(mailOptions);
            console.log('Email notification sent successfully');
        } catch (error) {
            console.error('Email notification error:', error);
        }
    }

    async sendWebhook(message, severity = 'info') {
        if (!this.webhookUrl) {
            console.log('Webhook not configured, skipping webhook notification');
            return;
        }

        try {
            const payload = {
                text: `[${severity.toUpperCase()}] ${message}`,
                timestamp: new Date().toISOString(),
                service: 'Mobile Carrier Testing Framework'
            };

            await axios.post(this.webhookUrl, payload);
            console.log('Webhook notification sent successfully');
        } catch (error) {
            console.error('Webhook notification error:', error);
        }
    }

    async notify(message, severity = 'info', channels = ['email', 'webhook']) {
        const promises = [];

        if (channels.includes('email') && process.env.NOTIFICATION_EMAIL) {
            promises.push(this.sendEmail(
                process.env.NOTIFICATION_EMAIL,
                'System Notification',
                message,
                severity
            ));
        }

        if (channels.includes('webhook')) {
            promises.push(this.sendWebhook(message, severity));
        }

        await Promise.allSettled(promises);
    }
}

module.exports = NotificationService;
