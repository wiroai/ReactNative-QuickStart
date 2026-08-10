import { render, screen } from '@testing-library/react-native';

import App from '../App';

describe('App', () => {
  it('renders the workspace SDK version', async () => {
    await render(<App />);

    expect(screen.getByText('WiroKit React Native')).toBeOnTheScreen();
    expect(screen.getByText('Version 0.1.0')).toBeOnTheScreen();
  });
});
