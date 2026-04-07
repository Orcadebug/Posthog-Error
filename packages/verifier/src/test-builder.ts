import type { Hypothesis } from '@w-ux/shared-types'

export interface TestScript {
  name: string
  code: string
  selector?: string
  expectedBehavior: string
}

/**
 * Build a CSS selector from an overlapping element descriptor
 */
function buildOverlaySelector(overlay: { tag: string; className?: string; id?: string }): string {
  let selector = overlay.tag
  
  if (overlay.id) {
    selector += `#${overlay.id}`
  } else if (overlay.className) {
    // Use first class name for selector
    const firstClass = overlay.className.split(' ')[0]
    selector += `.${firstClass}`
  }
  
  return selector
}

export function generateTest(hypothesis: Hypothesis): TestScript {
  const selector = extractSelector(hypothesis.description)
  
  // Extract metadata for overlay-aware testing
  const metadata = hypothesis.metadata as {
    cssBlockerState?: {
      pointerEvents?: string
      overlappingElements?: Array<{ tag: string; className?: string; id?: string; zIndex?: number }>
    }
    elementAtPointSelector?: string
    blockingReasons?: string[]
  } | undefined
  
  switch (hypothesis.category) {
    case 'blocked-cta':
      return generateBlockedCTATest(hypothesis, selector, metadata)
      
    case 'rage-click':
      return generateRageClickTest(hypothesis, selector, metadata)
      
    default:
      return generateGenericTest(hypothesis, selector)
  }
}

function generateBlockedCTATest(
  hypothesis: Hypothesis,
  selector: string | undefined,
  metadata: {
    cssBlockerState?: {
      pointerEvents?: string
      overlappingElements?: Array<{ tag: string; className?: string; id?: string; zIndex?: number }>
    }
    elementAtPointSelector?: string
  } | undefined
): TestScript {
  const targetSelector = selector || 'button'
  const cssBlockerState = metadata?.cssBlockerState
  const overlappingElements = cssBlockerState?.overlappingElements || []
  const hasPointerEventsNone = cssBlockerState?.pointerEvents === 'none'
  const elementAtPointSelector = metadata?.elementAtPointSelector
  
  // Build overlay assertions if we have overlapping elements
  let overlayAssertions = ''
  
  if (overlappingElements.length > 0) {
    const overlay = overlappingElements[0]
    const overlaySelector = buildOverlaySelector(overlay)
    const targetZIndex = overlay.zIndex ? overlay.zIndex - 1 : 0
    
    overlayAssertions = `
  // Verify overlay is present and above target element
  const overlay = page.locator('${overlaySelector}')
  await expect(overlay).toBeVisible()
  const overlayZ = await overlay.evaluate(el => parseInt(getComputedStyle(el).zIndex) || 0)
  expect(overlayZ).toBeGreaterThan(${targetZIndex})`
    
    // Add additional overlay assertions if multiple overlays exist
    if (overlappingElements.length > 1) {
      overlayAssertions += `
  // Verify ${overlappingElements.length} total overlapping elements
  const allOverlays = await page.locator('${overlay.tag}').all()
  let visibleOverlays = 0
  for (const el of allOverlays) {
    if (await el.isVisible()) visibleOverlays++
  }
  expect(visibleOverlays).toBeGreaterThanOrEqual(${overlappingElements.length})`
    }
  }
  
  // Build pointer-events assertion
  let pointerEventsAssertion = ''
  if (hasPointerEventsNone) {
    pointerEventsAssertion = `
  // Verify element has pointer-events: none
  const pe = await element.evaluate(el => getComputedStyle(el).pointerEvents)
  expect(pe).toBe('none')`
  }
  
  // Build elementFromPoint assertion
  let elementFromPointAssertion = ''
  if (elementAtPointSelector) {
    elementFromPointAssertion = `
  // Verify elementFromPoint returns different element (interception)
  const box = await element.boundingBox()
  const atPointTag = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x, y)?.tagName.toLowerCase(),
    [box!.x + box!.width / 2, box!.y + box!.height / 2]
  )
  expect(atPointTag).not.toBe('${targetSelector.replace(/^[.#]/, '').split(/[.#]/)[0]}')`
  } else if (overlappingElements.length > 0) {
    // Fallback: check elementFromPoint returns the overlay
    const overlayTag = overlappingElements[0].tag
    elementFromPointAssertion = `
  // Verify elementFromPoint returns overlay, not target
  const box = await element.boundingBox()
  const atPointTag = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x, y)?.tagName.toLowerCase(),
    [box!.x + box!.width / 2, box!.y + box!.height / 2]
  )
  expect(atPointTag).toBe('${overlayTag}')`
  }
  
  const code = `
import { test, expect } from '@playwright/test'

test('${hypothesis.title}', async ({ page }) => {
  await page.goto('${hypothesis.description.includes('url') ? '${URL}' : 'http://localhost:3000'}')
  
  const element = page.locator('${targetSelector}')
  
  // Check if element is visible
  await expect(element).toBeVisible()${overlayAssertions}${pointerEventsAssertion}${elementFromPointAssertion}
  
  // Attempt click (should fail or be intercepted)
  try {
    await element.click({ timeout: 5000 })
    // If click succeeds, verify expected behavior didn't happen
    ${hypothesis.description.includes('modal') ? "await expect(page.locator('.modal')).toBeVisible()" : '// No state change expected'}
  } catch (e) {
    // Expected: click should fail due to blocker
    expect(e.message).toContain('timeout') // or other appropriate error
  }
})
  `.trim()
  
  return {
    name: `verify-blocked-cta-${hypothesis.id.slice(0, 8)}`,
    code,
    selector: targetSelector,
    expectedBehavior: 'Element should be blocked by overlay or have pointer-events:none',
  }
}

function generateRageClickTest(
  hypothesis: Hypothesis,
  selector: string | undefined,
  metadata: {
    cssBlockerState?: {
      pointerEvents?: string
      overlappingElements?: Array<{ tag: string; className?: string; zIndex?: number }>
    }
  } | undefined
): TestScript {
  const targetSelector = selector || 'button'
  
  // Check if rage clicks are due to blocked element
  const cssBlockerState = metadata?.cssBlockerState
  const hasBlocker = cssBlockerState?.pointerEvents === 'none' || 
                     (cssBlockerState?.overlappingElements && cssBlockerState.overlappingElements.length > 0)
  
  let blockerAssertion = ''
  if (hasBlocker) {
    blockerAssertion = `
  // Verify element is blocked (explains rage clicks)
  const pe = await element.evaluate(el => getComputedStyle(el).pointerEvents)
  const box = await element.boundingBox()
  const atPoint = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x, y)?.tagName,
    [box!.x + box!.width / 2, box!.y + box!.height / 2]
  )
  const isBlocked = pe === 'none' || atPoint?.toLowerCase() !== '${targetSelector.replace(/^[.#]/, '').split(/[.#]/)[0]}'
  expect(isBlocked).toBe(true)`
  }
  
  const code = `
import { test, expect } from '@playwright/test'

test('${hypothesis.title}', async ({ page }) => {
  await page.goto('http://localhost:3000')
  
  const element = page.locator('${targetSelector}')
  ${blockerAssertion}
  
  // Multiple rapid clicks (rage click pattern)
  const clickPromises = []
  for (let i = 0; i < 5; i++) {
    clickPromises.push(element.click().catch(() => null))
    await page.waitForTimeout(100)
  }
  await Promise.all(clickPromises)
  
  // Should not cause errors or unexpected behavior
  await expect(page.locator('.error')).not.toBeVisible()
  
  // Check that click handler wasn't called excessively
  const clickCount = await page.evaluate(() => (window as any).__clickCount || 0)
  expect(clickCount).toBeLessThanOrEqual(1)
})
  `.trim()
  
  return {
    name: `verify-rage-click-${hypothesis.id.slice(0, 8)}`,
    code,
    selector: targetSelector,
    expectedBehavior: hasBlocker 
      ? 'Rage clicks explained by blocked element' 
      : 'Multiple clicks should not cause errors',
  }
}

function generateGenericTest(hypothesis: Hypothesis, selector: string | undefined): TestScript {
  return {
    name: `verify-${hypothesis.id.slice(0, 8)}`,
    code: `
import { test, expect } from '@playwright/test'

test('${hypothesis.title}', async ({ page }) => {
  await page.goto('http://localhost:3000')
  // TODO: Add specific test steps for ${hypothesis.category}
  // Description: ${hypothesis.description}
})
    `.trim(),
    selector,
    expectedBehavior: 'Test hypothesis behavior',
  }
}

function extractSelector(description: string): string | undefined {
  // Try to extract selector from "on element" pattern
  const match = description.match(/on ([a-z0-9_-]+(?:\.[a-z0-9_-]+)*)/i)
  if (match) return match[1]
  
  // Try to extract from "button.class" pattern
  const buttonMatch = description.match(/(button\.[a-z0-9_-]+)/i)
  if (buttonMatch) return buttonMatch[1]
  
  // Try to extract from "#id" pattern
  const idMatch = description.match(/#[a-z0-9_-]+/i)
  if (idMatch) return idMatch[0]
  
  return undefined
}
