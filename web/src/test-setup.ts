import '@testing-library/jest-dom';

// Required for React 19 act() support in testing environments
// https://react.dev/blog/2022/03/08/react-18-upgrade-guide#configuring-your-testing-environment
(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true;
