let vueApp = new Vue({
    el: '#app',
    data: {
        ros: null,
        connected: false,
        rosbridgeAddress: 'wss://i-0491b82177fd6399f.robotigniteacademy.com/0bfd1914-1d39-4c19-b887-f72f29eba070/rosbridge/',
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
                    // this.setup3D()
                })
                this.setupSubscribers()
                this.setupPublishers()
                this.cmdVelPublishInterval = setInterval(() => {
                    this.publishJoystick()
                }, 100);
                console.log("Connected to ROS")
            })
            this.ros.on('error', (error) => {
                this.connecting = false
                this.connectionError = 'Failed to connect to ROSBridge'
                console.error(error)
            })
            this.ros.on('close', () => {
                this.connected = false
                if (this.cmdVelPublishInterval) {
                    clearInterval(this.cmdVelPublishInterval)
                }
                document.getElementById('map').innerHTML = ''
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
                this.speed.linear =
                    msg.twist.twist.linear.x
                this.speed.angular =
                    msg.twist.twist.angular.z
                this.pose.x =
                    msg.pose.pose.position.x
                this.pose.y =
                    msg.pose.pose.position.y
                this.pose.theta =
                    msg.pose.pose.orientation.z * 180
            })
        },
        setupPublishers() {
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
            let viewer = new ROS2D.Viewer({
                divID: 'map',
                width: el.clientWidth,
                height: el.clientHeight
            })
            // Setup the map client
            let mapGridClient = new ROS2D.OccupancyGridClient({
                ros: this.ros,
                rootObject: viewer.scene,
                continuous: true,
            })
            // Scale the canvas to fit to the map
            mapGridClient.on('change', () => {
                viewer.scaleToDimensions(mapGridClient.currentGrid.width, mapGridClient.currentGrid.height);
                viewer.shift(mapGridClient.currentGrid.pose.position.x, mapGridClient.currentGrid.pose.position.y)
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
            let topic = new ROSLIB.Topic({
                ros: this.ros,
                name: '/move_base_simple/goal',
                messageType: 'geometry_msgs/PoseStamped'
            })
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
            topic.publish(goal)
        },
        emergencyStop() {
            this.joystick.vertical = 0
            this.joystick.horizontal = 0
            this.publishJoystick()
            alert("Emergency Stop Activated")
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
        },
        stopDrag() {
            this.dragging = false
            this.dragCircleStyle.left = '55px'
            this.dragCircleStyle.top = '55px'
            this.joystick.vertical = 0
            this.joystick.horizontal = 0
        }
    },
    mounted() {
        window.addEventListener(
            'mouseup',
            this.stopDrag,
        )
        // Node: just for debugg purpose, so delete it later
        this.connectROS()
    }
})
