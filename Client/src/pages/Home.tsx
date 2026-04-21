import { Link } from 'react-router-dom'
import '../App.css'
import wallE from '../assets/WALL-E.webp';

function Home() {
    return (
    <>
    <div className='homePoster'>
        <Link to="/movies">
        <img src={wallE} alt="WALL-E"/>
        </Link>
    </div>
    </>
    )
}

export default Home



