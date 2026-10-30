import * as React from 'react'
import {Slot} from '@radix-ui/react-slot'
import {cva, type VariantProps} from 'class-variance-authority'
import {cn} from '../../lib/utils'

const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-secondary disabled:text-muted-foreground',
        outline:
          'border border-border-strong bg-background text-foreground hover:bg-accent disabled:border-border disabled:text-muted-foreground',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-accent disabled:text-muted-foreground',
        ghost: 'text-muted-foreground hover:bg-accent hover:text-foreground disabled:text-faint-foreground',
        destructive: 'text-destructive hover:bg-fail-surface disabled:text-faint-foreground'
      },
      size: {
        default: 'h-9 px-3 text-sm',
        sm: 'h-8 px-2.5 text-sm',
        lg: 'h-10 px-4 text-sm',
        icon: 'size-8'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)

type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {asChild?: boolean}

function Button({className, variant, size, asChild = false, ...props}: ButtonProps) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({variant, size, className}))}
      {...props}
    />
  )
}

export {Button, buttonVariants}
