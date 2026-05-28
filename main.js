let vueApp = new Vue({
    el: '#app',
    data: {
        ros: null,
        connected: false,
        rosbridgeAddress: 'wss://i-0e25c77ffa41576df.robotigniteacademy.com/163cab43-1983-463f-832c-24ec1104c839/rosbridge/',
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
            left: '55px',
            top: '55px'
        },

    },

    methods: {
        connectROS() {
            this.connecting = true
            this.connectionError = ''
            this.ros = new ROSLIB.Ros({
                url: this.rosbridgeAddress
            })
            this.ros.on('connection', () => {
                this.connected = true
                this.connecting = false
                this.$nextTick(() => {
                    this.setupMap()
                    this.setupCamera()
                    // this.setup3D()
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
                document.getElementById('divCamera').innerHTML = ''
                console.log("Disconnected from ROS")
            })
        },
        setupSubscribers() {
            let odom = new ROSLIB.Topic({
                ros: this.ros,
                name: '/fastbot_1/odom',
                messageType: 'nav_msgs/Odometry'
            })
            odom.subscribe((msg) => {
                // odom publisher doesn't update its speed vals
                // this.speed.linear =
                //     msg.twist.twist.linear.x
                // this.speed.angular =
                //     msg.twist.twist.angular.z
                this.pose.x =
                    msg.pose.pose.position.x
                this.pose.y =
                    msg.pose.pose.position.y
                this.pose.theta =
                    msg.pose.pose.orientation.z * 180
            })
        },
        setupPublishers() {
            this.goalPoseTopic = new ROSLIB.Topic({
                ros: this.ros,
                name: '/goal_pose',
                messageType: 'geometry_msgs/PoseStamped'
            })
            this.cmdVelTopic = new ROSLIB.Topic({
                ros: this.ros,
                name: '/fastbot_1/cmd_vel',
                messageType: 'geometry_msgs/Twist'
            })
        },
        publishJoystick() {
            if (!this.connected || !this.cmdVelTopic) {
                return
            }
            // Update speed vals
            this.speed.linear = this.joystick.vertical
            this.speed.angular = this.joystick.horizontal

            let msg = new ROSLIB.Message({
                linear: {
                    x: this.joystick.vertical,
                    y: 0,
                    z: 0
                },
                angular: {
                    x: 0,
                    y: 0,
                    z: this.joystick.horizontal
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
                continuous: true,
            })
            // Scale the canvas to fit to the map
            mapGridClient.on('change', () => {
                mapViewer.scaleToDimensions(mapGridClient.currentGrid.width, mapGridClient.currentGrid.height);
                mapViewer.shift(mapGridClient.currentGrid.pose.position.x, mapGridClient.currentGrid.pose.position.y)
            })
            
        },
        setupCamera() {
            let without_wss = this.rosbridgeAddress.split('wss://')[1]
            let domain = without_wss.split('/')[0] + '/' + without_wss.split('/')[1]
            // console.log(domain)
            let host = domain + '/cameras'
            const el = document.getElementById('divCamera')
            let viewer = new MJPEGCANVAS.Viewer({
                divID: 'divCamera',
                host: host,
                width: el.clientWidth,
                height: el.clientHeight,
                topic: '/fastbot_1/camera/image_raw',
                ssl: true,
            })
        },
        setup3D() {
            let viewer = new ROS3D.Viewer({
                divID: 'viewer3d',
                width: 300,
                height: 300,
                antialias: true
            })
            viewer.addObject(new ROS3D.Grid())
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
            let x =
                event.clientX - rect.left
            let y =
                event.clientY - rect.top
            x = Math.max(0, Math.min(180, x))
            y = Math.max(0, Math.min(180, y))
            this.dragCircleStyle.left =
                `${x - 35}px`
            this.dragCircleStyle.top =
                `${y - 35}px`
            this.joystick.vertical =
                -((y / 180) - 0.5)
            this.joystick.horizontal =
                ((x / 180) - 0.5)
            // console.log(this.joystick.vertical, this.joystick.horizontal)
             this.publishJoystick()
        },
        stopDrag() {
            this.dragging = false
            this.dragCircleStyle.left = '55px'
            this.dragCircleStyle.top = '55px'
            this.joystick.vertical = 0
            this.joystick.horizontal = 0
            this.publishJoystick()
        }
    },
    mounted() {
        // Node: just for debugg purpose, so delete it later
        this.connectROS()
    }
})
