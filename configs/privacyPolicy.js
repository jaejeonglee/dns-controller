module.exports = {
  version: "1.0.0",
  updatedAt: "2025-01-15",
  contact: {
    email: "hello@sitey.one",
    dataProtectionOfficer: "sitey.one Privacy Team",
  },
  scope: [
    "This policy applies to the sitey.one Domain Controller web application and related APIs.",
    "It covers how we collect, use, and store data that is required to deliver the service.",
  ],
  sections: [
    {
      id: "data-collected",
      title: "What we collect",
      statements: [
        "Subdomain records: the requested subdomain, destination IP, and management password hash.",
        "Usage metadata: timestamps and status codes generated when you create, update, or delete a record.",
        "Support messages: optional contact details you provide when requesting help.",
      ],
    },
    {
      id: "data-use",
      title: "How we use it",
      statements: [
        "Provision and manage DNS records on your behalf.",
        "Prevent abuse by auditing changes and enforcing rate limits.",
        "Contact you about service announcements or support conversations that you initiate.",
      ],
    },
    {
      id: "lawful-basis",
      title: "Lawful basis",
      statements: [
        "We process DNS record data under legitimate interest so the platform can function as expected.",
        "Support correspondence is processed with your consent when you reach out to us.",
      ],
    },
    {
      id: "retention",
      title: "Retention",
      statements: [
        "Active DNS records are kept while the subdomain remains in use.",
        "Inactive records are deleted after 90 days with no login or DNS change activity.",
        "Support tickets are purged 24 months after resolution unless we are legally required to keep them longer.",
      ],
    },
    {
      id: "security",
      title: "Security measures",
      statements: [
        "Passwords are stored using salted, one way hashes.",
        "All traffic between your browser and our API is encrypted with TLS 1.2 or higher.",
        "Access to operational tooling is restricted to on call staff with key based authentication.",
      ],
    },
    {
      id: "rights",
      title: "Your choices and rights",
      statements: [
        "You can update or delete your DNS record at any time using the management password.",
        "You may request a copy of stored data by emailing hello@sitey.one from the address associated with your record.",
        "If you believe we hold data in error, contact us and we will review and respond within 30 days.",
      ],
    },
  ],
  lastReviewedBy: "JAY DNS Operations",
};
