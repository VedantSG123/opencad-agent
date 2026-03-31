import axios from 'axios'

import { getBaseApiUrl } from '@/utils/getApiBaseUrl'

const axiosInstance = axios.create({
  baseURL: getBaseApiUrl(),
})

export default axiosInstance
