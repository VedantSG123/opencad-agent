import { Link } from 'react-router';

export default function NotFound() {
  return (
    <div className='min-h-screen bg-background flex flex-col items-center justify-center gap-4'>
      <span className='text-8xl font-extrabold text-muted-foreground/30'>
        404
      </span>
      <h1 className='text-2xl font-semibold text-foreground'>Page not found</h1>
      <p className='text-muted-foreground'>
        The page you are looking for does not exist.
      </p>
      <Link
        to='/'
        className='mt-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity'
      >
        Go home
      </Link>
    </div>
  );
}
