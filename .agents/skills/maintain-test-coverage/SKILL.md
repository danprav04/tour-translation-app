---
name: maintain-test-coverage
description: >-
  Use this skill whenever you are making changes to the codebase to ensure that the 100% automated test coverage standard is maintained. It requires you to review the tests associated with your changes and adjust or add new tests as needed.
---

# Maintain Test Coverage Skill

This project strictly enforces **100% Code Coverage** for both its React Native frontend and Node.js backend test suites. 

Whenever you modify existing code, add new features, or fix bugs, you MUST follow these steps to ensure coverage remains at 100%:

## Steps

1. **Identify Affected Tests**: Determine which files you are modifying and locate their corresponding test files (typically in `__tests__` directories or files ending in `.test.ts`/`.test.js`).
2. **Write/Update Tests**: 
   - If adding a new feature or file, create a new test file for it.
   - If modifying logic, update the existing tests to reflect the new behavior.
   - Ensure all edge cases, new branches, and new functions you introduced are covered by a test case.
3. **Run the Test Suite**: 
   - For backend changes, navigate to the `server` directory and run the test coverage command (`npm run test -- --coverage`).
   - For frontend changes, run the test coverage command at the project root (`npm run test -- --coverage`).
4. **Verify 100% Coverage**: Analyze the coverage report output. If any statement, branch, function, or line is below 100%, write additional tests until the coverage report confirms 100% across all metrics.
5. **Do not finish your task** until the local coverage report confirms that coverage hasn't dropped.
