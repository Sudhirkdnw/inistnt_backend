module.exports = {
  async up(db, client) {
    // 1. Seed superadmin role
    const modules = [
      "userManagement",
      "reports",
      "stories",
      "posts",
      "dating",
      "premium",
      "payments",
      "communities",
      "analytics",
      "verificationRequests"
    ];

    const allPermissionsTrue = {};
    modules.forEach(m => {
      allPermissionsTrue[m] = { view: true, create: true, update: true, delete: true };
    });

    let superadminRole = await db.collection("roles").findOne({ name: "superadmin" });
    if (!superadminRole) {
      const res = await db.collection("roles").insertOne({
        name: "superadmin",
        description: "Super Administrator with full platform controls.",
        permissions: allPermissionsTrue,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      superadminRole = { _id: res.insertedId };
      console.log("🟢 Seeded superadmin role successfully");
    }

    // 2. Link default admins
    const adminUser = await db.collection("users").findOne({ username: "admin" });
    if (adminUser) {
      await db.collection("users").updateOne(
        { _id: adminUser._id },
        { 
          $set: { 
            roleRef: superadminRole._id, 
            adminRole: "superadmin" 
          } 
        }
      );
      console.log("🟢 Linked default admin user to superadmin roleRef");
    }

    const itsfounderUser = await db.collection("users").findOne({ username: "itsfounder" });
    if (itsfounderUser) {
      await db.collection("users").updateOne(
        { _id: itsfounderUser._id },
        { 
          $set: { 
            role: "admin", 
            adminRole: "superadmin", 
            roleRef: superadminRole._id 
          } 
        }
      );
      console.log("🟢 Updated 'itsfounder' to have role: 'admin', adminRole: 'superadmin', and roleRef linked");
    }

    // Correct legacy superadmin role users
    await db.collection("users").updateMany(
      { role: "superadmin" },
      { 
        $set: { 
          role: "admin", 
          adminRole: "superadmin", 
          roleRef: superadminRole._id 
        } 
      }
    );

    // 3. Seed email templates
    const defaults = [
      {
        name: 'otp_verification',
        subject: '{{otp}} is your {{platform_name}} verification code',
        variables: ['otp', 'username', 'platform_name'],
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{{platform_name}} OTP Verification</title>
</head>
<body style="margin:0;padding:0;background:#0b0b12;font-family:Arial,Helvetica,sans-serif;color:#ffffff;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0b0b12;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#111827;border-radius:24px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
          <!-- Header -->
          <tr>
            <td align="center" style="padding:50px 40px 20px 40px;background:linear-gradient(135deg,#7c3aed,#ec4899);">
              <div style="font-size:42px;line-height:42px;">💜</div>
              <h1 style="margin:20px 0 10px 0;font-size:34px;font-weight:700;color:#ffffff;">
                Welcome to {{platform_name}}
              </h1>
              <p style="margin:0;font-size:16px;color:rgba(255,255,255,0.85);line-height:26px;">
                Your campus connection starts here ✨
              </p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:50px 40px;">
              <h2 style="margin:0 0 16px 0;font-size:28px;color:#ffffff;">
                Verify Your Account
              </h2>
              <p style="margin:0 0 30px 0;font-size:16px;line-height:28px;color:#cbd5e1;">
                Use the verification code below to securely access your {{platform_name}} account.
                This OTP is valid for a limited time only.
              </p>
              <!-- OTP Box -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <div style="background:linear-gradient(135deg,#8b5cf6,#ec4899);padding:22px 30px;border-radius:18px;display:inline-block;box-shadow:0 10px 30px rgba(236,72,153,0.25);">
                      <span style="font-size:38px;letter-spacing:10px;font-weight:700;color:#ffffff;">
                        {{otp}}
                      </span>
                    </div>
                  </td>
                </tr>
              </table>
              <p style="margin:35px 0 0 0;font-size:14px;line-height:24px;color:#94a3b8;">
                If you did not request this code, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="padding:30px;background:#0f172a;border-top:1px solid rgba(255,255,255,0.06);">
              <p style="margin:0;font-size:14px;color:#94a3b8;">
                © 2026 {{company_name}} — Verified College Community
              </p>
              <p style="margin:10px 0 0 0;font-size:12px;color:#64748b;">
                Made with 💜 for real campus connections
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
      },
      {
        name: 'password_reset',
        subject: 'Reset Your Password - {{platform_name}}',
        variables: ['url', 'username', 'platform_name'],
        content: `<p class="greeting">Hello {{username}},</p>
<p class="text">
    We received a request to securely reset your password for your <strong>{{platform_name}}</strong> account. Please click the button below to complete the process:
</p>
<div class="btn-container">
    <a href="{{url}}" class="btn" target="_blank">Reset My Password</a>
</div>
<p class="text" style="font-size: 13px; color: #94a3b8; text-align: center;">
    ⚠️ This secure reset link is valid for <strong>20 minutes</strong>.
</p>
<p class="text" style="font-size: 13px; color: #64748b; background-color: #f1f5f9; padding: 12px; border-radius: 8px;">
    If you're having trouble clicking the button, copy and paste the URL below into your browser:<br>
    <a href="{{url}}" style="color: #4f46e5; word-break: break-all;">{{url}}</a>
</p>
<p class="text">
    If you did not request a password change, please ignore this email; your credentials will remain safe and unaltered.
</p>`
      },
      {
        name: 'welcome_email',
        subject: 'Welcome to {{platform_name}}! 🎉',
        variables: ['username', 'platform_name'],
        content: `<p class="greeting">Welcome to the Club, {{username}}! 🎉</p>
<p class="text">
    Your account is now fully verified and activated! We are thrilled to have you join <strong>{{platform_name}}</strong> — the ultimate social environment for your campus.
</p>
<p class="text">
    Here's what you can do right away to get started:
</p>
<ul class="text" style="padding-left: 20px; line-height: 1.8;">
    <li>📝 <strong>Share Confessions</strong> anonymously or with your handle.</li>
    <li>💬 <strong>Engage</strong> on interesting threads with fellow students.</li>
    <li>💖 <strong>Explore Dating</strong> to match up with matches around your campus.</li>
    <li>🔒 <strong>Safety First</strong>: Real-time moderation protects your privacy.</li>
</ul>
<p class="text">
    If you have any feedback or ideas to share, just send us an email. Our team is always eager to listen!
</p>`
      },
      {
        name: 'security_alert',
        subject: '🚨 Security Alert for your {{platform_name}} account',
        variables: ['username', 'action', 'ipAddress', 'device', 'time', 'platform_name'],
        content: `<p class="greeting">Security Alert: Action Required</p>
<p class="text">
    Hi {{username}}, we detected some critical activity or a login attempt on your <strong>{{platform_name}}</strong> account. Please review the transaction details below:
</p>
<table class="info-table">
    <tr>
        <td class="label">Trigger Action</td>
        <td class="value"><strong>{{action}}</strong></td>
    </tr>
    <tr>
        <td class="label">IP Address</td>
        <td class="value"><code>{{ipAddress}}</code></td>
    </tr>
    <tr>
        <td class="label">Device/OS</td>
        <td class="value">{{device}}</td>
    </tr>
    <tr>
        <td class="label">Date & Time</td>
        <td class="value">{{time}}</td>
    </tr>
</table>
<p class="text" style="color: #b91c1c; font-weight: 600;">
    🚩 If this was not you, your account credentials might have been compromised!
</p>
<p class="text">
    We highly recommend changing your password immediately and securing your collegiate email. You can trigger a password recovery sequence directly from the login page.
</p>`
      },
      {
        name: 'account_approval',
        subject: 'Your {{platform_name}} account has been approved',
        variables: ['username', 'platform_name'],
        content: `<p class="greeting">Dear {{username}},</p>
<p class="text">
    Your student identity has been verified successfully. You can now access <strong>{{platform_name}}</strong>.
</p>
<p class="text">
    Feel free to log in and start connecting with your fellow college peers right away!
</p>`
      },
      {
        name: 'account_rejection',
        subject: 'Student Verification Update - {{platform_name}}',
        variables: ['username', 'reason', 'platform_name'],
        content: `<p class="greeting">Dear {{username}},</p>
<p class="text">
    Thank you for your interest in joining <strong>{{platform_name}}</strong>. We have reviewed the college ID card verification you provided.
</p>
<p class="text">
    Unfortunately, your verification could not be approved at this time for the following reason:
</p>
<div style="background-color: #FEE2E2; border-left: 4px solid #EF4444; padding: 15px; margin: 20px 0; border-radius: 4px; color: #991B1B;">
    <strong>Reason:</strong> {{reason}}
</div>
<p class="text">
    If you believe this was an error, please sign up again with a clearer picture of your student ID card or try verifying using a valid college email address.
</p>`
      }
    ];

    for (const def of defaults) {
      const exists = await db.collection("emailtemplates").findOne({ name: def.name });
      if (!exists) {
        await db.collection("emailtemplates").insertOne({
          ...def,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        console.log(`🟢 Seeded email template: ${def.name}`);
      }
    }
  },

  async down(db, client) {
    // Optional rollback logic
    await db.collection("roles").deleteOne({ name: "superadmin" });
    await db.collection("emailtemplates").deleteMany({
      name: { $in: ['otp_verification', 'password_reset', 'welcome_email', 'security_alert', 'account_approval', 'account_rejection'] }
    });
  }
};
