import * as React from 'react'
import {cn} from '../../lib/utils'

function Input({className, type = 'text', ...props}: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground transition-colors duration-150 motion-reduce:transition-none',
        'placeholder:text-faint-foreground',
        'focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
        'disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground',
        className
      )}
      {...props}
    />
  )
}

export {Input}
