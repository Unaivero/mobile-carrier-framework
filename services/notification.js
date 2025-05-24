const nodemailer = require('nodemailer');
const axios = require('axios');

class NotificationService {
    constructor() {
        this.emailTransporter = null;
        this.initialized = false;
    }

    async initialize() {
        try {
            // Initialize email transporter if configured
            if (process.env.SMTP_HOST) {
                this.emailTransporter = nodemailer.createTransporter({
                    host: process.env.SMTP_HOST,
                    port: process.env.SMTP_PORT || 587,
                    secure: process.env.SMTP_SECURE === 'true',
                    auth: {
                        user: process.env.SMTP_USER,
                        pass: process.env.SMTP_PASS
                    }
                });

                // Verify connection
                await this.emailTransporter.verify();
                console.log('Email transporter initialized successfully');
            }

            this.initialized = true;
        } catch (error) {
            console.warn('Email configuration not available or invalid:', error.message);
        }
    }

    async sendEmail(options) {
        if (!this.emailTransporter) {
            throw new Error('Email transporter not configured');
        }

        const mailOptions = {
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to: options.to,
            subject: options.subject,
            text: options.text,
            html: options.html || options.text
        };

        try {
            const result = await this.emailTransporter.sendMail(mailOptions);
            console.log('Email sent successfully:', result.messageId);
            return result;
        } catch (error) {
            console.error('Failed to send email:', error);
            throw error;
        }
    }

    async sendWebhook(url, payload) {
        try {
            const response = await axios.post(url, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mobile-Carrier-Framework/1.0'
                },
                timeout: 10000
            });

            console.log('Webhook sent successfully:', response.status);
            return response.data;
        } catch (error) {
            console.error('Failed to send webhook:', error);
            throw error;
        }
    }

    async sendTestNotification(testId, status, details = {}) {
        const notification = {
            type: 'test_status',
            testId,
            status,
            details,
            timestamp: new Date().toISOString()
        };

        await this.sendNotification('Test Status Update', `Test ${testId} is now ${status}`, notification);
    }

    async sendSystemNotification(type, message, details = {}) {
        const notification = {
            type: 'system',
            subType: type,
            message,
            details,
            timestamp: new Date().toISOString()
        };

        await this.sendNotification(`System ${type}`, message, notification);
    }

    async sendNotification(subject, message, payload = {}) {
        const promises = [];

        // Send email notification if configured
        if (this.emailTransporter && process.env.NOTIFICATION_EMAIL) {
            promises.push(
                this.sendEmail({
                    to: process.env.NOTIFICATION_EMAIL,
                    subject: `Mobile Carrier Framework - ${subject}`,
                    text: message,
                    html: this.generateEmailHTML(subject, message, payload)
                }).catch(error => {
                    console.error('Email notification failed:', error);
                })
            );
        }

        // Send webhook notification if configured
        if (process.env.WEBHOOK_URL) {
            promises.push(
                this.sendWebhook(process.env.WEBHOOK_URL, {
                    subject,
                    message,
                    payload,
                    source: 'mobile-carrier-framework'
                }).catch(error => {
                    console.error('Webhook notification failed:', error);
                })
            );
        }

        if (promises.length > 0) {
            await Promise.allSettled(promises);
        }
    }

    generateEmailHTML(subject, message, payload) {
        return `
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .header { background: #007bff; color: white; padding: 20px; text-align: center; }
                .content { padding: 20px; }
                .details { background: #f8f9fa; padding: 15px; border-left: 4px solid #007bff; margin: 20px 0; }
                .footer { background: #f8f9fa; padding: 10px; text-align: center; font-size: 12px; color: #666; }
                .status-running { color: #007bff; }
                .status-completed { color: #28a745; }
                .status-failed { color: #dc3545; }
                .status-error { color: #dc3545; }
                pre { background: #f8f9fa; padding: 10px; border-radius: 4px; overflow-x: auto; }
            </style>
        </head>
        <body>
            <div class="header">
                <h2>Mobile Carrier Testing Framework</h2>
                <h3>${subject}</h3>
            </div>
            <div class="content">
                <p>${message}</p>
                
                ${payload.testId ? `
                <div class="details">
                    <h4>Test Details</h4>
                    <p><strong>Test ID:</strong> ${payload.testId}</p>
                    ${payload.status ? `<p><strong>Status:</strong> <span class="status-${payload.status}">${payload.status.toUpperCase()}</span></p>` : ''}
                    ${payload.type ? `<p><strong>Type:</strong> ${payload.type}</p>` : ''}
                </div>
                ` : ''}
                
                ${payload.details && Object.keys(payload.details).length > 0 ? `
                <div class="details">
                    <h4>Additional Details</h4>
                    <pre>${JSON.stringify(payload.details, null, 2)}</pre>
                </div>
                ` : ''}
            </div>
            <div class="footer">
                <p>Generated at ${new Date().toLocaleString()}</p>
                <p>Mobile Carrier Testing Framework</p>
            </div>
        </body>
        </html>
        `;
    }

    // Notification templates for different scenarios
    async notifyTestStarted(testId, testType, config = {}) {
        await this.sendTestNotification(testId, 'started', {
            type: testType,
            config,
            message: `${testType} test has been started`
        });
    }

    async notifyTestCompleted(testId, testType, results = {}) {
        await this.sendTestNotification(testId, 'completed', {
            type: testType,
            results,
            message: `${testType} test has completed successfully`
        });
    }

    async notifyTestFailed(testId, testType, error) {
        await this.sendTestNotification(testId, 'failed', {
            type: testType,
            error: error.message,
            message: `${testType} test has failed`
        });
    }

    async notifySystemAlert(alertType, message, severity = 'warning') {
        await this.sendSystemNotification(alertType, message, {
            severity,
            source: 'system-monitor'
        });
    }

    async notifyPerformanceAlert(metric, value, threshold, testId = null) {
        const message = `Performance alert: ${metric} is ${value} (threshold: ${threshold})`;
        await this.sendSystemNotification('performance-alert', message, {
            metric,
            value,
            threshold,
            testId,
            severity: 'warning'
        });
    }

    async notifyMaintenanceEvent(eventType, details = {}) {
        const message = `Maintenance event: ${eventType}`;
        await this.sendSystemNotification('maintenance', message, {
            eventType,
            details,
            severity: 'info'
        });
    }
}

module.exports = NotificationService;