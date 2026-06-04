let vueApp = new Vue({
    el: '#app',
    data: {
        ros: null,
        connected: false,
        rosbridgeAddress: '',
        goalPoseTopic: null,
        cmdVelTopic: null,
        cmdVelPublishInterval: null,
        connecting: false,
        connectionError: '',
        dragging: false,
        joystick: {
            vertical: 0,
            horizontal: 0
        },
        speed: {
            linear: 0,
            angular: 0
        },
        pose: {
            x: 0,
            y: 0,
            theta: 0
        },
        dragCircleStyle: {
            left: '0px',
            top: '0px'
        },
    },

    methods: {
        connectROS() {
            this.connecting = true
            this.connectionError = ''
            this.ros = new ROSLIB.Ros({
                url: this.rosbridgeAddress,
                groovyCompatibility: false,
            })
            this.ros.on('connection', () => {
                this.connected = true
                this.connecting = false
                this.$nextTick(() => {
                    this.stopDrag()
                    this.setupMap()
                    this.setupCamera()
                    this.setup3D()
                })
                this.setupSubscribers()
                this.setupPublishers()
                console.log("Connected to ROS")
            })
            this.ros.on('error', (error) => {
                this.connecting = false
                this.connectionError = 'Failed to connect to ROSBridge'
                console.error(error)
            })
            this.ros.on('close', () => {
                this.connected = false
                document.getElementById('map').innerHTML = ''
                document.getElementById('cameraImg').innerHTML = ''
                document.getElementById('divCamera').innerHTML = ''
                document.getElementById('div3DViewer').innerHTML = ''
                clearInterval(this.cmdVelPublishInterval)
                console.log("Disconnected from ROS")
            })
        },
        setupSubscribers() {
            let odom = new ROSLIB.Topic({
                ros: this.ros,
                name: '/fastbot_1/odom',
                messageType: 'nav_msgs/Odometry',
                throttle_rate: 100,
                queue_length: 1,
            })
            odom.subscribe((msg) => {
                // odom publisher doesn't update its speed vals
                // this.speed.linear =
                //     msg.twist.twist.linear.x
                // this.speed.angular =
                //     msg.twist.twist.angular.z

                this.pose.x = msg.pose.pose.position.x
                this.pose.y = msg.pose.pose.position.y
                this.pose.theta = msg.pose.pose.orientation.z * 180
            })

            let cmdVelSub = new ROSLIB.Topic({
                ros: this.ros,
                name: '/fastbot_1/cmd_vel',
                messageType: 'geometry_msgs/Twist',
                throttle_rate: 200,
                queue_length: 1,
            })
            cmdVelSub.subscribe((msg) => {
                this.speed.linear = msg.linear.x
                this.speed.angular = msg.angular.z
            })
        },
        setupPublishers() {
            this.goalPoseTopic = new ROSLIB.Topic({
                ros: this.ros,
                name: '/goal_pose',
                messageType: 'geometry_msgs/PoseStamped',
                queue_size: 1,
            })
            this.cmdVelTopic = new ROSLIB.Topic({
                ros: this.ros,
                name: '/fastbot_1/cmd_vel',
                messageType: 'geometry_msgs/Twist',
                queue_size: 1,
            })
            this.cmdVelPublishInterval = setInterval(() => {
                if (this.dragging) {
                    this.publishJoystick()
                }
            }, 33); // 30 Hz
        },
        publishJoystick() {
            if (!this.connected || !this.cmdVelTopic) {
                return
            }
            let msg = new ROSLIB.Message({
                linear: {
                    x: this.joystick.vertical,
                    y: 0,
                    z: 0
                },
                angular: {
                    x: 0,
                    y: 0,
                    z: -this.joystick.horizontal
                }
            })
            this.cmdVelTopic.publish(msg)
        },
        setupMap() {
            const el = document.getElementById('map')
            let mapViewer = new ROS2D.Viewer({
                divID: 'map',
                width: el.clientWidth,
                height: el.clientHeight
            })
            // Setup the map client
            let mapGridClient = new ROS2D.OccupancyGridClient({
                ros: this.ros,
                rootObject: mapViewer.scene,
                continuous: false,
            })
            // Scale the canvas to fit to the map
            mapGridClient.on('change', () => {
                mapViewer.scaleToDimensions(mapGridClient.currentGrid.width, mapGridClient.currentGrid.height);
                mapViewer.shift(mapGridClient.currentGrid.pose.position.x, mapGridClient.currentGrid.pose.position.y)
            })

            let tfClient = new ROSLIB.TFClient({
                ros: this.ros,
                angularThres: 0.01,
                transThres: 0.01,
                rate: 10.0,
                topicTimeout: 1.0,
                fixedFrame: 'fastbot_1_odom'
            })

            let robotMarker = new ROS2D.NavigationImage({
                size: 0.4,
                image: 'fastbot.png',
                pulse: false,
            })

            robotMarker.visible = false;
            mapViewer.scene.addChild(robotMarker);

            tfClient.subscribe('fastbot_1_base_link', (transform) => {
                // Extract position
                robotMarker.x = transform.translation.x;
                robotMarker.y = -transform.translation.y;

                let q = transform.rotation;
                let theta = Math.atan2(2.0 * (q.w * q.z + q.x * q.y), 1.0 - 2.0 * (q.y * q.y + q.z * q.z));

                robotMarker.rotation = -theta * (180 / Math.PI);                
                robotMarker.visible = true;
            })
            
        },
        setupCamera() {
            // Load snapshot img first for warm up, and then get video stream
            let without_wss = this.rosbridgeAddress.split('wss://')[1]
            let domain = without_wss.split('/')[0] + '/' + without_wss.split('/')[1]
            // console.log(domain)
            let host = domain + '/cameras'
            const el = document.getElementById('divCamera')

            const img = document.getElementById('cameraImg')

            img.onload = () => {
                // Start MJPEG after first image is visible
                img.style.display = 'none'
                let viewer = new MJPEGCANVAS.Viewer({
                    divID: 'divCamera',
                    host: host,
                    width: el.clientWidth,
                    height: el.clientHeight,
                    topic: '/fastbot_1/camera/image_raw&type=ros_compressed',
                    ssl: true,
                })
            }

            img.onerror = () => {
                console.warn('Snapshot failed, starting stream directly')

                let viewer = new MJPEGCANVAS.Viewer({
                    divID: 'divCamera',
                    host: host,
                    width: el.clientWidth,
                    height: el.clientHeight,
                    topic: '/fastbot_1/camera/image_raw&type=ros_compressed',
                    ssl: true,
                })
            }

            const url = new URL(this.rosbridgeAddress)
            img.src = `https://${url.hostname}${url.pathname.replace('/rosbridge/', '/cameras/')}snapshot?topic=/fastbot_1/camera/image_raw`

        },
        setup3D() {
            const el = document.getElementById('div3DViewer')
            let viewer = new ROS3D.Viewer({
                background: '#cccccc',
                divID: 'div3DViewer',
                width: el.clientWidth,
                height: el.clientHeight,
                antialias: true,
                fixedFrame: 'fastbot_1_odom'
            })

            viewer.addObject(new ROS3D.Grid({
                color:'#0181c4',
                cellSize: 0.5,
                num_cells: 20
            }))

            let tfClient = new ROSLIB.TFClient({
                ros: this.ros,
                angularThres: 0.01,
                transThres: 0.01,
                rate: 10.0,
                topicTimeout: 1.0,
                fixedFrame: 'fastbot_1_base_link'
            })

            // Setup the URDF client.
            let urdfClient = new ROS3D.UrdfClient({
                ros: this.ros,
                param: '/fastbot_1_robot_state_publisher:robot_description',
                tfClient: tfClient,
                // We use "path: location.origin + location.pathname"
                // instead of "path: window.location.href" to remove query params,
                // otherwise the assets fail to load
                path: location.origin + location.pathname,
                rootObject: viewer.scene,
                loader: ROS3D.COLLADA_LOADER_2
            })
        },
        goToWaypoint(x, y) {
            let goal = new ROSLIB.Message({
                header: {
                    frame_id: 'map'
                },
                pose: {
                    position: {
                        x: x,
                        y: y,
                        z: 0
                    },
                    orientation: {
                        x: 0,
                        y: 0,
                        z: 0,
                        w: 1
                    }
                }
            })
            this.goalPoseTopic.publish(goal)
        },
        disconnect() {
            this.joystick.vertical = 0
            this.joystick.horizontal = 0
            this.publishJoystick()
            this.ros.close()
        },
        startDrag() {
            this.dragging = true
        },
        doDrag(event) {
            if (!this.dragging) return
            let rect =
                event.currentTarget.getBoundingClientRect()
            const SIZE = rect.width
            const KNOB = document.getElementById('dragCircle').offsetWidth
            const RADIUS = KNOB / 2

            let x =
                event.clientX - rect.left
            let y =
                event.clientY - rect.top
            x = Math.max(0, Math.min(SIZE, x))
            y = Math.max(0, Math.min(SIZE, y))
            this.dragCircleStyle.left =
                `${x - RADIUS}px`
            this.dragCircleStyle.top =
                `${y - RADIUS}px`
            this.joystick.vertical =
                -((y / SIZE) - 0.5)
            this.joystick.horizontal =
                ((x / SIZE) - 0.5)
        },
        stopDrag() {
            this.dragging = false
            const zone = document.getElementById('dragstartzone')
            const knob = document.getElementById('dragCircle')
            const center =
                (zone.offsetWidth - knob.offsetWidth) / 2
            this.dragCircleStyle.left = `${center}px`
            this.dragCircleStyle.top = `${center}px`

            this.joystick.vertical = 0
            this.joystick.horizontal = 0
            this.publishJoystick()
        }
    },
    mounted() {
    }
})
