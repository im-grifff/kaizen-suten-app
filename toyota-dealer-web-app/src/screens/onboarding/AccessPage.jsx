import { Link } from 'react-router-dom'

export function AccessPage() {
  return (
    <div className='screen'>
      <div className='card'>
        <div className='brand'>
          <div className='brand__mark'>SUTEN</div>
          <div className='brand__text'>
            <div className='brand__title'>SUTEN</div>
            <div className='brand__subtitle'>TOYOTA TENDEAN MANADO</div>
          </div>
        </div>

        <h1 className='h1'>Masuk</h1>
        <p className='muted'>
          Login menggunakan <b>Plat Nomor</b> untuk akses modul: Pricelist, Trade
          In, Tshop, dan Profile.
        </p>

        <div className='actions'>
          <Link className='btn btn--primary' to='/login'>
            Lanjutkan
          </Link>
        </div>

        <p className='small muted'>Versi draft/demo mendukung mode tanpa Firebase.</p>
      </div>
    </div>
  )
}
