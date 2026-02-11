// ==============================================
// PORTAL API INTEGRATION TESTS
// ==============================================
// Tests for portal interaction with backend API

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { chromium } from 'playwright';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';

describe('Portal API Integration', () => {
  let browser;
  let context;
  let page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  beforeEach(async () => {
    context = await browser.newContext();
    page = await context.newPage();

    // Mock fetch for controlled testing
    await page.addInitScript((apiUrl) => {
      window.mockFetch = window.fetch;
      window.fetch = async (url, options) => {
        console.log('Fetch intercepted:', url);
        return window.mockFetch(url, options);
      };
    }, API_BASE_URL);
  });

  afterAll(async () => {
    await browser?.close();
  });

  describe('Token Validation', () => {
    it('should validate token on page load', async () => {
      const validToken = 'a'.repeat(64);

      // Intercept validation request
      await page.route(`${API_BASE_URL}/onboarding-portal/validate/${validToken}`, (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            valid: true,
            mandant: {
              firmenname: 'Test GmbH',
              email: 'test@example.com',
            },
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          }),
        });
      });

      const portalPath = `file://${__dirname}/../01-portal/vd-portal-v11-INLINE-TOGGLES.html?token=${validToken}`;
      await page.goto(portalPath);

      // Wait for validation
      await page.waitForTimeout(1000);

      // Should show success state
      const mandantName = await page.locator('.mandant-name').textContent();
      expect(mandantName).toContain('Test GmbH');
    });

    it('should handle invalid token', async () => {
      const invalidToken = 'invalid-token';

      await page.route(`${API_BASE_URL}/onboarding-portal/validate/${invalidToken}`, (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            valid: false,
            message: 'Ungültiger Token',
          }),
        });
      });

      const portalPath = `file://${__dirname}/../01-portal/vd-portal-v11-INLINE-TOGGLES.html?token=${invalidToken}`;
      await page.goto(portalPath);

      await page.waitForTimeout(1000);

      // Should show error
      const errorMessage = await page.locator('.error-message').textContent();
      expect(errorMessage).toContain('Ungültiger Token');
    });

    it('should handle expired token', async () => {
      const expiredToken = 'b'.repeat(64);

      await page.route(`${API_BASE_URL}/onboarding-portal/validate/${expiredToken}`, (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            valid: false,
            message: 'Token abgelaufen',
          }),
        });
      });

      const portalPath = `file://${__dirname}/../01-portal/vd-portal-v11-INLINE-TOGGLES.html?token=${expiredToken}`;
      await page.goto(portalPath);

      await page.waitForTimeout(1000);

      const errorMessage = await page.locator('.error-message').textContent();
      expect(errorMessage).toContain('abgelaufen');
    });
  });

  describe('Form Submission', () => {
    it('should submit acceptance with signature', async () => {
      const validToken = 'c'.repeat(64);
      let submittedData;

      // Mock validation
      await page.route(`${API_BASE_URL}/onboarding-portal/validate/${validToken}`, (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            valid: true,
            mandant: { firmenname: 'Test GmbH' },
          }),
        });
      });

      // Mock submission
      await page.route(`${API_BASE_URL}/onboarding-portal/submit`, (route) => {
        submittedData = JSON.parse(route.request().postData());
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            mandantId: 'mandant-123',
            pdfUrl: '/storage/contracts/test.pdf',
            message: 'Beauftragung erfolgreich',
          }),
        });
      });

      const portalPath = `file://${__dirname}/../01-portal/vd-portal-v11-INLINE-TOGGLES.html?token=${validToken}`;
      await page.goto(portalPath);

      await page.waitForTimeout(1000);

      // Fill form
      await page.locator('input[name="firmenname"]').fill('Test GmbH');
      await page.locator('input[name="ansprechpartnerVorname"]').fill('Max');
      await page.locator('input[name="ansprechpartnerNachname"]').fill('Mustermann');
      await page.locator('input[type="email"]').fill('max@example.com');

      // Draw signature
      const canvas = await page.locator('canvas#signature-canvas').first();
      const box = await canvas.boundingBox();
      if (box) {
        await page.mouse.move(box.x + 10, box.y + 10);
        await page.mouse.down();
        await page.mouse.move(box.x + 100, box.y + 50);
        await page.mouse.up();
      }

      // Submit
      await page.locator('button[type="submit"]').click();

      await page.waitForTimeout(2000);

      // Check submitted data
      expect(submittedData).toBeDefined();
      expect(submittedData.token).toBe(validToken);
      expect(submittedData.action).toBe('accept');
      expect(submittedData.signature_data).toBeDefined();
      expect(submittedData.signature_data).toContain('data:image/png;base64');
    });

    it('should submit decline with reason', async () => {
      const validToken = 'd'.repeat(64);
      let submittedData;

      await page.route(`${API_BASE_URL}/onboarding-portal/validate/${validToken}`, (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            valid: true,
            mandant: { firmenname: 'Test GmbH' },
          }),
        });
      });

      await page.route(`${API_BASE_URL}/onboarding-portal/submit`, (route) => {
        submittedData = JSON.parse(route.request().postData());
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            mandantId: 'mandant-123',
            message: 'Ablehnung gespeichert',
          }),
        });
      });

      const portalPath = `file://${__dirname}/../01-portal/vd-portal-v11-INLINE-TOGGLES.html?token=${validToken}`;
      await page.goto(portalPath);

      await page.waitForTimeout(1000);

      // Click decline button
      await page.locator('button.decline-button').click();

      // Fill decline reason
      await page.locator('textarea[name="decline_reason"]').fill('Zu teuer');

      // Confirm decline
      await page.locator('button.confirm-decline').click();

      await page.waitForTimeout(2000);

      // Check submitted data
      expect(submittedData).toBeDefined();
      expect(submittedData.action).toBe('decline');
      expect(submittedData.decline_reason).toBe('Zu teuer');
    });

    it('should include user agent and IP in submission', async () => {
      const validToken = 'e'.repeat(64);
      let submittedData;

      await page.route(`${API_BASE_URL}/onboarding-portal/validate/${validToken}`, (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            valid: true,
            mandant: { firmenname: 'Test GmbH' },
          }),
        });
      });

      await page.route(`${API_BASE_URL}/onboarding-portal/submit`, (route) => {
        submittedData = JSON.parse(route.request().postData());
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      });

      const portalPath = `file://${__dirname}/../01-portal/vd-portal-v11-INLINE-TOGGLES.html?token=${validToken}`;
      await page.goto(portalPath);

      await page.waitForTimeout(1000);

      // Fill minimal form
      await page.locator('input[name="firmenname"]').fill('Test');
      await page.locator('input[type="email"]').fill('test@example.com');

      // Draw signature
      const canvas = await page.locator('canvas#signature-canvas').first();
      const box = await canvas.boundingBox();
      if (box) {
        await page.mouse.move(box.x + 10, box.y + 10);
        await page.mouse.down();
        await page.mouse.move(box.x + 50, box.y + 50);
        await page.mouse.up();
      }

      await page.locator('button[type="submit"]').click();

      await page.waitForTimeout(2000);

      // Check metadata
      expect(submittedData.user_agent).toBeDefined();
      expect(submittedData.timestamp).toBeDefined();
    });

    it('should handle submission errors gracefully', async () => {
      const validToken = 'f'.repeat(64);

      await page.route(`${API_BASE_URL}/onboarding-portal/validate/${validToken}`, (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            valid: true,
            mandant: { firmenname: 'Test GmbH' },
          }),
        });
      });

      await page.route(`${API_BASE_URL}/onboarding-portal/submit`, (route) => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            message: 'Server error',
          }),
        });
      });

      const portalPath = `file://${__dirname}/../01-portal/vd-portal-v11-INLINE-TOGGLES.html?token=${validToken}`;
      await page.goto(portalPath);

      await page.waitForTimeout(1000);

      // Fill and submit form
      await page.locator('input[name="firmenname"]').fill('Test');
      await page.locator('input[type="email"]').fill('test@example.com');

      const canvas = await page.locator('canvas#signature-canvas').first();
      const box = await canvas.boundingBox();
      if (box) {
        await page.mouse.move(box.x + 10, box.y + 10);
        await page.mouse.down();
        await page.mouse.move(box.x + 50, box.y + 50);
        await page.mouse.up();
      }

      await page.locator('button[type="submit"]').click();

      await page.waitForTimeout(2000);

      // Should show error message
      const errorMessage = await page.locator('.error-message').textContent();
      expect(errorMessage).toContain('Server error');
    });
  });

  describe('Network Error Handling', () => {
    it('should handle offline state', async () => {
      // Simulate offline
      await context.setOffline(true);

      const validToken = 'g'.repeat(64);
      const portalPath = `file://${__dirname}/../01-portal/vd-portal-v11-INLINE-TOGGLES.html?token=${validToken}`;

      await page.goto(portalPath);
      await page.waitForTimeout(1000);

      // Should show network error
      const errorMessage = await page.locator('.network-error').textContent();
      expect(errorMessage).toContain('Netzwerkfehler');
    });

    it('should retry on timeout', async () => {
      let requestCount = 0;

      await page.route(`${API_BASE_URL}/onboarding-portal/validate/**`, (route) => {
        requestCount++;
        if (requestCount === 1) {
          // First request times out
          route.abort('timedout');
        } else {
          // Second request succeeds
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              valid: true,
              mandant: { firmenname: 'Test GmbH' },
            }),
          });
        }
      });

      const validToken = 'h'.repeat(64);
      const portalPath = `file://${__dirname}/../01-portal/vd-portal-v11-INLINE-TOGGLES.html?token=${validToken}`;

      await page.goto(portalPath);
      await page.waitForTimeout(3000);

      // Should eventually succeed
      expect(requestCount).toBeGreaterThan(1);
    });
  });
});
