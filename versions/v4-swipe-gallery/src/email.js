const nodemailer = require("nodemailer");

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function createEmailService(site) {
  const configured = Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM && process.env.NOTIFY_EMAIL);
  if (!configured) {
    return {
      configured: false,
      async sendAppointment() {
        return { delivered: false, reason: "SMTP is not configured." };
      }
    };
  }

  const port = Number(process.env.SMTP_PORT || 587);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: String(process.env.SMTP_SECURE).toLowerCase() === "true",
    auth: process.env.SMTP_USER ? {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD
    } : undefined
  });

  return {
    configured: true,
    async sendAppointment(appointment) {
      const slot = appointment.slotStartsAt
        ? `<p><strong>Reserved slot:</strong> ${escapeHtml(appointment.slotStartsAt)} (${escapeHtml(site.calendar.timeZone)})</p>`
        : "";
      const details = `
        <h2>New Ruth Talia website request</h2>
        <p><strong>Name:</strong> ${escapeHtml(appointment.name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(appointment.email)}</p>
        <p><strong>Phone:</strong> ${escapeHtml(appointment.phone)}</p>
        ${slot}
        <p><strong>Event date:</strong> ${escapeHtml(appointment.eventDate || "Not supplied")}</p>
        <p><strong>Occasion:</strong> ${escapeHtml(appointment.occasion || "Not supplied")}</p>
        <p><strong>Message:</strong><br>${escapeHtml(appointment.message || "No message").replace(/\n/g, "<br>")}</p>
      `;
      await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: process.env.NOTIFY_EMAIL,
        replyTo: appointment.email,
        subject: `New website request from ${appointment.name}`,
        html: details
      });
      await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: appointment.email,
        subject: appointment.language === "he" ? "קיבלנו את הפנייה שלך — Ruth Talia Couture" : "We received your request — Ruth Talia Couture",
        html: appointment.language === "he"
          ? `<p>שלום ${escapeHtml(appointment.name)},</p><p>תודה שפנית לרות טליה קוטור. קיבלנו את הפרטים שלך וניצור איתך קשר בהקדם.</p>`
          : `<p>Hello ${escapeHtml(appointment.name)},</p><p>Thank you for contacting Ruth Talia Couture. We received your details and will be in touch shortly.</p>`
      });
      return { delivered: true };
    }
  };
}

module.exports = { createEmailService };
