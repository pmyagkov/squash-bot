/**
 * ESLint rule to enforce a single root describe block in test files
 */
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce a single root describe block in test files',
      category: 'Best Practices',
      recommended: false,
    },
    fixable: null,
    schema: [],
    messages: {
      multipleRootDescribe: 'Only one root describe block allowed (found {{count}})',
      noRootDescribe: 'Test file must have a root describe block',
    },
  },
  create(context) {
    const filename = context.getFilename()

    // Skip files in helpers directory
    if (filename.includes('/helpers/') || filename.includes('\\helpers\\')) {
      return {}
    }

    // Only check files that are actual test files (end with .test.ts or .test.tsx)
    if (!filename.endsWith('.test.ts') && !filename.endsWith('.test.tsx')) {
      return {}
    }

    return {
      Program(node) {
        // Find all top-level describe calls
        const rootDescribes = []

        for (const statement of node.body) {
          // Check for ExpressionStatement with describe call
          if (statement.type === 'ExpressionStatement') {
            const expression = statement.expression
            if (
              expression.type === 'CallExpression' &&
              expression.callee.type === 'Identifier' &&
              expression.callee.name === 'describe'
            ) {
              rootDescribes.push(statement)
            }
          }
        }

        if (rootDescribes.length === 0) {
          context.report({
            node: node.body[0] || node,
            messageId: 'noRootDescribe',
          })
        } else if (rootDescribes.length > 1) {
          // Report only the second describe block (more specific, less noisy)
          const secondDescribe = rootDescribes[1]
          const callee = secondDescribe.expression.callee

          // Report only on the 'describe' identifier itself using range
          // This ensures only the word 'describe' is highlighted, not the whole expression
          context.report({
            loc: callee.loc,
            messageId: 'multipleRootDescribe',
            data: {
              count: rootDescribes.length,
            },
          })
        }
      },
    }
  },
}
