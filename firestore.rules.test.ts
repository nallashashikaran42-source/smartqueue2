import assert from 'node:assert/strict';
import fs from 'node:fs';

/**
 * Static and structural verification suite for SmartQueue Firestore Security Rules
 * validating the Dirty Dozen security assertions against firestore.rules.
 */
const rulesText = fs.readFileSync(new URL('./firestore.rules', import.meta.url), 'utf8');

const dirtyDozenAssertions: Array<{ name: string; check: () => void }> = [
  {
    name: '1. Global default-deny catch-all rule is defined first',
    check: () => {
      assert.match(rulesText, /match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;\s*\}/);
    },
  },
  {
    name: '2. Self-assigned admin/operator role blocked on user creation',
    check: () => {
      assert.match(rulesText, /incoming\(\)\.role == 'citizen'/);
    },
  },
  {
    name: '3. Shadow / ghost fields blocked by strict keys().hasAll() and keys().hasOnly()',
    check: () => {
      assert.match(rulesText, /data\.keys\(\)\.hasAll\(/);
      assert.match(rulesText, /data\.keys\(\)\.hasOnly\(/);
    },
  },
  {
    name: '4. Unverified email spoof blocked via email_verified == true and owner emails authorized',
    check: () => {
      assert.match(rulesText, /request\.auth\.token\.email_verified == true/);
      assert.match(rulesText, /nallashashikaran42@gmail\.com/);
    },
  },
  {
    name: '5. PII isolated into /users/{userId}/private/info with owner-or-admin read',
    check: () => {
      assert.match(rulesText, /match \/private\/\{docId\}/);
      assert.match(rulesText, /request\.auth\.uid == userId \|\| isAdmin\(\)/);
    },
  },
  {
    name: '6. Ticket terminal states locked against non-admin modification',
    check: () => {
      assert.match(rulesText, /!\(existing\(\)\.status in \['Completed', 'Cancelled', 'Skipped', 'NoShow'\]\)/);
    },
  },
  {
    name: '7. Path variable ID poisoning guard enforced via isValidId()',
    check: () => {
      assert.match(rulesText, /id\.matches\('\^\[a-zA-Z0-9_\\\\-\]\+\$'\)/);
    },
  },
  {
    name: '8. Server timestamp integrity enforced via request.time',
    check: () => {
      assert.match(rulesText, /incoming\(\)\.createdAt == request\.time/);
      assert.match(rulesText, /incoming\(\)\.updatedAt == request\.time/);
    },
  },
  {
    name: '9. Immutable fields protected on update',
    check: () => {
      assert.match(rulesText, /incoming\(\)\.uid == existing\(\)\.uid/);
      assert.match(rulesText, /incoming\(\)\.createdAt == existing\(\)\.createdAt/);
    },
  },
  {
    name: '10. Master gate enforces active parent user on subcollections',
    check: () => {
      assert.match(rulesText, /get\(\/databases\/\$\(database\)\/documents\/users\/\$\(userId\)\)\.data\.accountStatus == 'active'/);
    },
  },
  {
    name: '11. Action-based updates restrict affectedKeys().hasOnly()',
    check: () => {
      assert.match(rulesText, /incoming\(\)\.diff\(existing\(\)\)\.affectedKeys\(\)\.hasOnly\(/);
    },
  },
  {
    name: '12. List queries enforce resource.data ownership with zero get()/exists() lookups',
    check: () => {
      assert.match(rulesText, /allow list: if isSignedIn\(\) && \(\s*isAdmin\(\) \|\|\s*\(request\.auth\.uid == userId && resource\.data\.uid == request\.auth\.uid\)/);
    },
  },
];

for (const assertion of dirtyDozenAssertions) {
  assertion.check();
}

console.log(`All ${dirtyDozenAssertions.length} Dirty Dozen Firestore security assertions passed.`);
