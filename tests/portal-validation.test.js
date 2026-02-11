// ==============================================
// PORTAL VALIDATION TESTS
// ==============================================
// Tests for HTML form validation and UI components

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { chromium } from 'playwright';

describe('VD Portal Validation', () => {
  let browser;
  let page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();

    // Load the portal HTML
    const portalPath = `file://${__dirname}/../01-portal/vd-portal-v11-INLINE-TOGGLES.html`;
    await page.goto(portalPath, { waitUntil: 'networkidle' });
  });

  afterAll(async () => {
    await browser?.close();
  });

  describe('Page Structure', () => {
    it('should have correct title', async () => {
      const title = await page.title();
      expect(title).toContain('Verfahrensdokumentation');
    });

    it('should have CI logo', async () => {
      const logo = await page.locator('.ci-logo').count();
      expect(logo).toBeGreaterThan(0);
    });

    it('should have journey banner', async () => {
      const banner = await page.locator('.journey-banner').count();
      expect(banner).toBeGreaterThan(0);
    });
  });

  describe('Token Validation', () => {
    it('should detect missing token', async () => {
      // Load page without token
      const portalPath = `file://${__dirname}/../01-portal/vd-portal-v11-INLINE-TOGGLES.html`;
      await page.goto(portalPath);

      // Should show error or redirect
      const errorMessage = await page.locator('.error-message').count();
      expect(errorMessage).toBeGreaterThan(0);
    });

    it('should accept valid token in URL', async () => {
      const validToken = 'a'.repeat(64); // 64 char hex token
      const portalPath = `file://${__dirname}/../01-portal/vd-portal-v11-INLINE-TOGGLES.html?token=${validToken}`;

      await page.goto(portalPath);

      // Should not show token error
      const tokenError = await page.locator('.token-error').count();
      expect(tokenError).toBe(0);
    });
  });

  describe('Form Fields', () => {
    it('should have company name field', async () => {
      const field = await page.locator('input[name="firmenname"]').count();
      expect(field).toBeGreaterThan(0);
    });

    it('should have contact person fields', async () => {
      const vornameField = await page
        .locator('input[name="ansprechpartnerVorname"]')
        .count();
      const nachnameField = await page
        .locator('input[name="ansprechpartnerNachname"]')
        .count();

      expect(vornameField).toBeGreaterThan(0);
      expect(nachnameField).toBeGreaterThan(0);
    });

    it('should have email field', async () => {
      const field = await page.locator('input[type="email"]').count();
      expect(field).toBeGreaterThan(0);
    });

    it('should have signature canvas', async () => {
      const canvas = await page.locator('canvas#signature-canvas').count();
      expect(canvas).toBeGreaterThan(0);
    });
  });

  describe('Clause Toggles', () => {
    it('should have clause toggles', async () => {
      const toggles = await page.locator('.clause-toggle').count();
      expect(toggles).toBeGreaterThan(0);
    });

    it('should toggle clause visibility', async () => {
      // Find first toggle
      const firstToggle = await page.locator('.clause-toggle').first();
      await firstToggle.click();

      // Check if content is visible
      const isVisible = await page
        .locator('.clause-content')
        .first()
        .isVisible();
      expect(isVisible).toBe(true);

      // Toggle again
      await firstToggle.click();

      // Check if hidden
      const isHidden = await page.locator('.clause-content').first().isHidden();
      expect(isHidden).toBe(true);
    });

    it('should have all required clauses', async () => {
      const requiredClauses = [
        'p0-01-hierarchy',
        'p0-03-widerruf',
        'p0-04-eidas',
        'p0-05-pdf-hash',
      ];

      for (const clauseId of requiredClauses) {
        const clause = await page.locator(`[data-clause-id="${clauseId}"]`).count();
        expect(clause).toBeGreaterThan(0);
      }
    });
  });

  describe('Form Validation', () => {
    it('should validate required fields', async () => {
      const submitButton = await page.locator('button[type="submit"]').first();
      await submitButton.click();

      // Should show validation errors
      const errors = await page.locator('.error-message, .field-error').count();
      expect(errors).toBeGreaterThan(0);
    });

    it('should validate email format', async () => {
      const emailField = await page.locator('input[type="email"]').first();
      await emailField.fill('invalid-email');

      const submitButton = await page.locator('button[type="submit"]').first();
      await submitButton.click();

      // Should show email validation error
      const isInvalid = await emailField.evaluate((el) => !el.validity.valid);
      expect(isInvalid).toBe(true);
    });

    it('should require signature', async () => {
      // Fill all fields but no signature
      await page.locator('input[name="firmenname"]').fill('Test GmbH');
      await page
        .locator('input[name="ansprechpartnerVorname"]')
        .fill('Max');
      await page
        .locator('input[name="ansprechpartnerNachname"]')
        .fill('Mustermann');
      await page.locator('input[type="email"]').fill('max@example.com');

      const submitButton = await page.locator('button[type="submit"]').first();
      await submitButton.click();

      // Should show signature required error
      const signatureError = await page.locator('.signature-error').count();
      expect(signatureError).toBeGreaterThan(0);
    });
  });

  describe('Signature Canvas', () => {
    it('should allow drawing signature', async () => {
      const canvas = await page.locator('canvas#signature-canvas').first();
      const box = await canvas.boundingBox();

      if (box) {
        // Draw a simple line
        await page.mouse.move(box.x + 10, box.y + 10);
        await page.mouse.down();
        await page.mouse.move(box.x + 100, box.y + 50);
        await page.mouse.up();

        // Canvas should now have content
        const hasContent = await canvas.evaluate((el) => {
          const ctx = el.getContext('2d');
          const imageData = ctx.getImageData(0, 0, el.width, el.height);
          return imageData.data.some((pixel) => pixel !== 0);
        });

        expect(hasContent).toBe(true);
      }
    });

    it('should have clear signature button', async () => {
      const clearButton = await page.locator('button.clear-signature').count();
      expect(clearButton).toBeGreaterThan(0);
    });

    it('should clear signature', async () => {
      const canvas = await page.locator('canvas#signature-canvas').first();

      // Draw something
      const box = await canvas.boundingBox();
      if (box) {
        await page.mouse.move(box.x + 10, box.y + 10);
        await page.mouse.down();
        await page.mouse.move(box.x + 50, box.y + 50);
        await page.mouse.up();
      }

      // Click clear button
      const clearButton = await page.locator('button.clear-signature').first();
      await clearButton.click();

      // Canvas should be empty
      const isEmpty = await canvas.evaluate((el) => {
        const ctx = el.getContext('2d');
        const imageData = ctx.getImageData(0, 0, el.width, el.height);
        return imageData.data.every((pixel) => pixel === 0);
      });

      expect(isEmpty).toBe(true);
    });
  });

  describe('Submit Button', () => {
    it('should have submit button', async () => {
      const button = await page.locator('button[type="submit"]').count();
      expect(button).toBeGreaterThan(0);
    });

    it('should disable button after click', async () => {
      const button = await page.locator('button[type="submit"]').first();
      await button.click();

      // Button should be disabled during submission
      const isDisabled = await button.isDisabled();
      expect(isDisabled).toBe(true);
    });

    it('should show loading spinner', async () => {
      const button = await page.locator('button[type="submit"]').first();
      await button.click();

      const spinner = await page.locator('.spinner, .loading').count();
      expect(spinner).toBeGreaterThan(0);
    });
  });

  describe('Responsive Design', () => {
    it('should be mobile responsive', async () => {
      await page.setViewportSize({ width: 375, height: 667 }); // iPhone size

      // Check if mobile menu exists
      const mobileMenu = await page.locator('.jb-mobile').isVisible();
      expect(mobileMenu).toBe(true);
    });

    it('should hide desktop nav on mobile', async () => {
      await page.setViewportSize({ width: 375, height: 667 });

      // Desktop steps should be hidden
      const desktopSteps = await page.locator('.jb-steps').isVisible();
      expect(desktopSteps).toBe(false);
    });

    it('should show desktop nav on desktop', async () => {
      await page.setViewportSize({ width: 1920, height: 1080 });

      // Desktop steps should be visible
      const desktopSteps = await page.locator('.jb-steps').isVisible();
      expect(desktopSteps).toBe(true);
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', async () => {
      const ariaLabels = await page.locator('[aria-label]').count();
      expect(ariaLabels).toBeGreaterThan(0);
    });

    it('should have form labels', async () => {
      const labels = await page.locator('label').count();
      expect(labels).toBeGreaterThan(0);
    });

    it('should have alt text for images', async () => {
      const images = await page.locator('img').all();
      for (const img of images) {
        const alt = await img.getAttribute('alt');
        expect(alt).toBeDefined();
      }
    });

    it('should support keyboard navigation', async () => {
      await page.keyboard.press('Tab');

      const focusedElement = await page.evaluate(() =>
        document.activeElement?.tagName
      );
      expect(focusedElement).toBeDefined();
      expect(focusedElement).not.toBe('BODY');
    });
  });
});
