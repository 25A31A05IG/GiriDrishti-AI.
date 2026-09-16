# Security Policy

## GiriDrishti AI

GiriDrishti AI is an academic/research prototype. Security issues are taken seriously, particularly issues involving credentials, APIs, databases, and user information.

---

## Supported Versions

As this project is currently under active development, security fixes will generally be considered for the latest version of the project.

| Version                     | Supported |
| --------------------------- | --------- |
| Current development version | ✅         |
| Older versions              | ❌         |

---

## Reporting a Security Issue

If you discover a security vulnerability, please avoid publicly posting sensitive details before the issue has been reviewed.

Security issues may include:

* Exposed credentials
* Authentication bypass
* Unauthorized database access
* API authorization problems
* Injection vulnerabilities
* Sensitive information exposure
* Server-side vulnerabilities
* Dependency vulnerabilities
* Improper access controls

---

## Environment variables
```env
MONGO_URI=your_database_connection_string
JWT_SECRET=your_secret
API_KEY=your_api_key
```

---

## Recommended Security Practices

### 1. Environment Variables

Store sensitive configuration in `.env` files.

Ensure `.env` is included in `.gitignore`.

---

### 2. Input Validation

All externally supplied inputs should be validated before processing.

---

### 3. Database Security

Database credentials should not be exposed to frontend code.

Production databases should use appropriate authentication and network restrictions.

---

### 4. API Security

APIs should:

* Validate requests
* Restrict unauthorized access
* Return safe error messages
* Avoid exposing internal implementation details

---

### 5. Dependency Management

Dependencies should be regularly reviewed and updated.

Run:

```bash
npm audit
```

for Node.js projects where applicable.

Python dependencies should also be periodically reviewed for known vulnerabilities.

---

## Sensitive Data

The project should avoid storing unnecessary personal or sensitive information.

Where personal information is introduced in future versions, appropriate access controls and privacy practices should be implemented.

---

## Responsible Disclosure

Please provide enough information to reproduce a security issue without publicly exposing credentials, private information, or an easily exploitable vulnerability.
