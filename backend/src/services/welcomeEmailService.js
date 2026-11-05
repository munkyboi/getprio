const notificationService = require("./notificationService");
const { appUrl, createBrandedEmail } = require("./emailTemplates");

async function sendWelcomeEmail({ user, tenant }) {
  if (!user?.email) return false;
  const vendor = Boolean(tenant);
  try {
    const email = createBrandedEmail({
      subject: vendor ? `Welcome to GetPrio, ${tenant.name}!` : "Welcome to GetPrio!",
      title: vendor ? "Welcome to your workspace." : "A little less waiting.",
      subtitle: vendor ? "Let’s get your business ready." : "Welcome to GetPrio.",
      greeting: user.name ? `Hi ${user.name},` : "Hello,",
      message: vendor
        ? [`Your GetPrio workspace for ${tenant.name} has been created.`, "Add your business details and configure your queue. Your dashboard will guide you through any required setup."]
        : ["Your GetPrio account is ready.", "Browse vendors, explore services, and manage your bookings and queue tickets in one place."],
      illustration: "welcome",
      hero: true,
      actionLabel: vendor ? "Set up my workspace" : "Explore vendors",
      actionUrl: appUrl(vendor ? "/dashboard" : "/vendors"),
      footer: "Need a hand getting started? Contact our support team using the link below."
    });
    return await notificationService.sendEmail({
      to: user.email,
      ...email,
      tenantId: tenant?._id,
      purpose: vendor ? "vendor_welcome" : "customer_welcome",
      metadata: { userId: user._id }
    });
  } catch {
    // Signup has already completed. Never turn a delivery failure into a
    // failed registration or expose provider messages/recipient data in logs.
    console.warn("[welcome-email-failed]", { userId: user._id, audience: vendor ? "vendor" : "customer" });
    return false;
  }
}

module.exports = { sendWelcomeEmail };
