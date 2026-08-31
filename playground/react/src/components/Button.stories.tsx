import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { Button } from './Button';

const meta: Meta<typeof Button> = {
  component: Button,
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Qaeditedprops: Story = {
  args: {
    variant: "secondary",
    size: "small",
    onClick: fn(),
    children: "EDITED-BY-QA",
  },
};
