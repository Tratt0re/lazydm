import { cva } from 'class-variance-authority';

const datePickerVariants = cva('', {
  variants: {
    arcSize: {
      sm: '',
      default: '',
      lg: '',
    },
    arcType: {
      default: '',
      outline: '',
      ghost: '',
    },
  },
  defaultVariants: {
    arcSize: 'default',
    arcType: 'outline',
  },
});

export { datePickerVariants };
