import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { WiroKitInfo } from '@wiro-ai/wirokit-react-native';

import App from '../App';

describe('App', () => {
  it('renders the image generation example', async () => {
    await render(<App />);

    expect(screen.getByText('Wiro Image Generation')).toBeOnTheScreen();
    expect(
      screen.getByText(`Version ${WiroKitInfo.version} · FLUX.2 Pro`),
    ).toBeOnTheScreen();
    expect(screen.getByText('Generate image')).toBeOnTheScreen();
  });

  it('asks for a prompt before generating', async () => {
    await render(<App />);

    fireEvent.press(screen.getByText('Generate image'));

    await waitFor(() => {
      expect(
        screen.getByText('Enter a prompt before generating an image.'),
      ).toBeOnTheScreen();
    });
  });
});
